import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const PROVIDER = (process.env.TRANSLATOR_PROVIDER || 'anthropic').toLowerCase();
const ANTHROPIC_MODEL = process.env.ANTHROPIC_TRANSLATOR_MODEL || 'claude-sonnet-4-6';
const OPENAI_MODEL = process.env.OPENAI_TRANSLATOR_MODEL || 'gpt-4o-mini';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isKoreanSource(source) {
  return source === 'Yonhap News'
    || source === 'InsideVina'
    || source === 'Yonhap Vietnam'
    || source === 'Yonhap Main';
}

// ── 베트남 고유명사 정식 한국어 표기 사전 ─────────────────────────
// 이 사전에 없는 베트남어는 "원어 그대로 보존"이 원칙.
// LLM이 임의로 "하노이/Nguyen"으로 디폴트하는 것을 막기 위한 기준 데이터.
const PLACES = [
  // 직할시 (5)
  'Hà Nội→하노이', 'Hồ Chí Minh→호찌민', 'Đà Nẵng→다낭', 'Hải Phòng→하이퐁', 'Cần Thơ→껀터',
  // 주요 도시/관광지
  'Huế→후에', 'Nha Trang→나짱', 'Vũng Tàu→붕따우', 'Đà Lạt→달랏', 'Quy Nhơn→꾸이년',
  'Vinh→빈', 'Biên Hòa→비엔호아', 'Phan Thiết→판티엣', 'Hội An→호이안', 'Sa Pa→사파',
  'Hạ Long→하롱', 'Phú Quốc→푸꾸옥', 'Côn Đảo→꼰다오',
  // 주요 성(省)
  'Bình Dương→빈즈엉성', 'Đồng Nai→동나이성', 'Long An→롱안성', 'Bắc Ninh→박닌성',
  'Bắc Giang→박장성', 'Quảng Ninh→꽝닌성', 'Quảng Nam→꽝남성', 'Quảng Ngãi→꽝응아이성',
  'Thanh Hóa→타인호아성', 'Nghệ An→응에안성', 'Hà Tĩnh→하띤성', 'Khánh Hòa→칸호아성',
  'Kiên Giang→끼엔장성', 'An Giang→안장성', 'Tiền Giang→띠엔장성', 'Vĩnh Long→빈롱성',
  'Bến Tre→벤째성', 'Cà Mau→까마우성', 'Lâm Đồng→럼동성', 'Bà Rịa-Vũng Tàu→바리어붕따우성',
  'Tây Ninh→떠이닌성', 'Hà Nam→하남성', 'Nam Định→남딘성', 'Thái Bình→타이빈성',
  'Hưng Yên→흥옌성', 'Hải Dương→하이즈엉성', 'Vĩnh Phúc→빈푹성', 'Phú Thọ→푸토성',
  'Thái Nguyên→타이응웬성', 'Lạng Sơn→랑선성', 'Cao Bằng→까오방성', 'Điện Biên→디엔비엔성',
];

const SURNAMES = [
  'Nguyễn→응우옌', 'Trần→쩐', 'Lê→레', 'Phạm→팜', 'Hoàng→호앙', 'Huỳnh→후잉',
  'Phan→판', 'Vũ→부', 'Võ→보', 'Đặng→당', 'Bùi→부이', 'Đỗ→도', 'Hồ→호',
  'Ngô→응오', 'Dương→즈엉', 'Lý→리', 'Đinh→딘', 'Trịnh→찐', 'Đoàn→도안',
  'Lâm→럼', 'Mai→마이', 'Trương→쯔엉', 'Tô→또', 'Tạ→따', 'Cao→까오',
];

const VN_GLOSSARY = `
[Vietnamese place names — use these EXACT Korean spellings]
${PLACES.join(', ')}

[Vietnamese surnames — use these EXACT Korean spellings]
${SURNAMES.join(', ')}
`.trim();

// ── 베트남 고유명사 처리 핵심 규칙 (모든 프롬프트에 공통 삽입) ─────
const PROPER_NOUN_RULES = `
**VIETNAMESE PROPER NOUN RULES — READ CAREFULLY:**

1. Use the glossary below as the AUTHORITATIVE source for Vietnamese place names and surnames.

2. **ABSOLUTE PROHIBITION on hallucinated defaults:**
   - DO NOT translate any Vietnamese place name as "하노이" unless the input text literally contains "Hà Nội" or "Hanoi".
   - DO NOT translate any Vietnamese surname as "응우옌" or "Nguyen" unless the input text literally contains "Nguyễn" or "Nguyen".
   - These are the most common Vietnamese name/place in training data; the model tends to default to them. This is FORBIDDEN.

3. For Vietnamese words NOT in the glossary:
   - DO NOT guess a Korean transliteration.
   - Keep the Vietnamese original (with diacritics) exactly as it appears in the input.
   - It is BETTER to leave "Phạm Minh Chính" in Vietnamese than to invent a wrong Korean spelling.

4. For Vietnamese words IN the glossary:
   - Use the exact Korean spelling from the glossary.
   - Then add the Vietnamese original in parentheses on first mention: e.g., "다낭(Đà Nẵng)".

5. Preserve Vietnamese diacritics (ă, â, ê, ô, ơ, ư, đ) exactly when keeping the original.

${VN_GLOSSARY}
`.trim();

// ── 통합 LLM 호출 함수 (provider 추상화) ─────────────────────────
// schema: JSON Schema 객체를 넘기면 Structured Outputs 로 "유효한 JSON"을 API가 보장.
//   → 기사체 큰따옴표("...라고 말했다")가 문자열을 깨서 JSON.parse 실패하던 사고를 원천 차단.
async function callLLM({ system, user, maxTokens = 2000, expectJson = true, schema = null }) {
  if (PROVIDER === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set (TRANSLATOR_PROVIDER=anthropic)');
    }
    // Structured Outputs 사용 시엔 API가 JSON을 강제하므로 "Return ONLY JSON" 지시가 불필요.
    const userPrompt = (expectJson && !schema)
      ? `${user}\n\nReturn ONLY valid JSON. No markdown fences, no preamble, no trailing text.`
      : user;
    // Prompt caching: system prompt(글로서리 + 한국 기사체 ≈ 4K 토큰)를 5분 TTL로 캐싱.
    // 첫 호출만 cache write (1.25배 비용), 이후 batch 내 호출은 cache read (0.1배 비용 + 빠른 응답).
    // batch-translate(BATCH_SIZE=10) 안에서 9건은 cache hit → 1건당 응답 시작 latency 크게 감소.
    const resp = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userPrompt }],
      ...(schema ? { output_config: { format: { type: 'json_schema', schema } } } : {}),
    });
    const text = resp.content?.[0]?.type === 'text' ? resp.content[0].text : '';
    if (!text) throw new Error('Empty response from Anthropic');
    // Cache hit/miss 가시화 — Vercel logs에서 효과 확인용
    if (resp.usage) {
      const { cache_creation_input_tokens: cw = 0, cache_read_input_tokens: cr = 0, input_tokens: it = 0 } = resp.usage;
      if (cw > 0 || cr > 0) {
        console.log(`[Translator/anthropic] cache write=${cw}, read=${cr}, fresh_input=${it}`);
      }
    }
    return text.trim();
  }

  // OpenAI fallback path
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set (TRANSLATOR_PROVIDER=openai)');
  }
  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    ...(schema
      ? { response_format: { type: 'json_schema', json_schema: { name: 'translation', schema, strict: true } } }
      : expectJson ? { response_format: { type: 'json_object' } } : {}),
  });
  const text = resp.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI');
  return text.trim();
}

// JSON 응답에서 ```json ... ``` 마크다운 펜스가 있을 경우 제거
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1].trim() : text;
}

// ── 한국 기사체(한국식 뉴스 문체) 강제 규칙 ─────────────────────────
const KOREAN_NEWS_STYLE = `
**KOREAN NEWS-WRITING STYLE — MANDATORY (한국식 기사문체 필수):**

The output MUST read like a Korean newspaper article (조선·중앙·연합·매경 스타일), NOT like a casual translation.

[HEADLINES — 헤드라인 (제목)]
- Use noun-ending or verb-stem ending (명사형/어간 종결), NOT polite or sentence-ending forms.
  - GOOD: "베트남 1분기 GDP 6.5% 성장", "삼성, 호찌민 신규 공장 착공", "외국인 투자 사상 최대"
  - BAD: "베트남이 1분기에 GDP가 6.5% 성장했습니다." (X — too verbose, polite ending)
- Omit subject particles (이/가, 은/는) where natural; use comma to separate subject from action.
  - GOOD: "베트남 정부, 전기료 5% 인상 발표"
- No quotation marks around the whole headline. No trailing punctuation (., !, ?).
- 15-30 Korean characters preferred.

[BODY — 본문 문체]
- Declarative endings only: "~다", "~했다", "~이다", "~밝혔다", "~전망이다", "~한 것으로 나타났다", "~로 알려졌다".
- NEVER use polite/conversational endings: "~습니다", "~합니다", "~예요", "~죠".
- Use formal news terminology:
  - 출처: "~에 따르면", "~가 밝혔다", "~로 전해졌다", "한편"
  - 인용: "○○○ 측은 \"...\"라고 말했다", "○○○는 \"...\"고 밝혔다"
  - 시간: "지난 ○일", "오는 ○일", "이날", "현지 시간"
  - 추정: "~로 추정된다", "~할 것으로 보인다", "~할 전망이다"
- Person reference on first mention: full name + position. e.g., "팜민찐(Phạm Minh Chính) 베트남 총리는…".
  After first mention: surname only or "○ 총리".
- Numbers: use Korean comma format (1,000) and units (명, 건, 대, 곳, 억 동, 달러).
- Active voice preferred; minimize adjectives; objective tone.
- Paragraphs: 1-3 sentences each. No emoji. No filler ("정말", "매우" 등 과장 부사 자제).
`.trim();

// ── 공통 system 프롬프트 ─────────────────────────────────────────
const SYSTEM_PROMPT_BASE = `You are an expert Korean news translator specializing in Vietnamese-Korean translation for a Korean-language news site about Vietnam.

Your two core responsibilities are:
(1) ACCURACY — translate ONLY what is in the input. Never add facts, names, places, or numbers that are not in the input. When uncertain about a Vietnamese proper noun, preserve the Vietnamese original verbatim.
(2) STYLE — the output MUST read like a Korean newspaper article (한국식 신문 기사문), not like a casual or machine translation.

${PROPER_NOUN_RULES}

${KOREAN_NEWS_STYLE}`;

// ── Structured Outputs 스키마 (유효 JSON 보장) ─────────────────────
// additionalProperties:false + 모든 필드 required 는 structured outputs 요구사항.
// category 는 enum 대신 string — 다운스트림에서 정규화/검증하므로 스키마 거부 위험 제거.
const SCHEMA_TITLE = {
  type: 'object',
  properties: { title: { type: 'string' }, category: { type: 'string' } },
  required: ['title', 'category'],
  additionalProperties: false,
};
const SCHEMA_TITLE_CAT = {
  type: 'object',
  properties: { translatedTitle: { type: 'string' }, category: { type: 'string' } },
  required: ['translatedTitle', 'category'],
  additionalProperties: false,
};
const SCHEMA_FULL = {
  type: 'object',
  properties: {
    translatedTitle: { type: 'string' },
    translatedSummary: { type: 'string' },
    translatedContent: { type: 'string' },
  },
  required: ['translatedTitle', 'translatedSummary', 'translatedContent'],
  additionalProperties: false,
};

// ════════════════════════════════════════════════════════════════
// translateTitle: 단순 제목 번역 + 카테고리 분류
// ════════════════════════════════════════════════════════════════
export async function translateTitle(item) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.warn('[Translator] No API key configured');
    return { translatedTitle: null, category: item.category || 'Society' };
  }

  if (isKoreanSource(item.source)) {
    return { translatedTitle: item.title, category: item.category || 'Society' };
  }

  const userPrompt = `Translate this Vietnamese/English news headline to Korean news headline style (한국식 기사 헤드라인).

**Style requirements:**
- 15-30 Korean characters, concise and impactful
- Authentic Korean news headline style (not conversational)
- Use Korean news terminology: "~에 따르면", "~밝혔다", "~한 것으로 나타났다"

Apply the Vietnamese proper noun rules from the system prompt strictly.

Return JSON: {"title": "<Korean headline>", "category": "<one of: Society/Economy/Real Estate/Culture/Politics/International/Korea-Vietnam/Community>"}

Title: ${item.title}`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callLLM({ system: SYSTEM_PROMPT_BASE, user: userPrompt, maxTokens: 400, schema: SCHEMA_TITLE });
      const result = JSON.parse(extractJson(raw));
      if (!result.title || typeof result.title !== 'string') {
        throw new Error('Invalid response structure: missing title');
      }
      const validCategories = ['Society', 'Economy', 'Real Estate', 'Culture', 'Politics', 'Policy', 'International', 'Korea-Vietnam', 'Community'];
      const normalizedCategory = result.category === 'Policy' ? 'Politics' : result.category;
      const category = validCategories.includes(normalizedCategory) ? normalizedCategory : 'Society';
      return { translatedTitle: result.title, category };
    } catch (error) {
      lastError = error;
      console.warn(`[Translator/${PROVIDER}] translateTitle attempt ${attempt}/${MAX_RETRIES}:`, error.message);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  console.error(`[Translator/${PROVIDER}] translateTitle failed:`, item.title?.substring(0, 80));
  return {
    translatedTitle: item.title || '[번역 실패]',
    category: item.category || 'Society',
    error: lastError?.message,
  };
}

// ════════════════════════════════════════════════════════════════
// translateFullArticle: 본문 전체 번역 (제목+요약+본문)
// ════════════════════════════════════════════════════════════════
export async function translateFullArticle(title, summary, content) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return {
      translatedTitle: 'Translation Failed - API Key Missing',
      translatedSummary: 'Translation Failed - API Key Missing',
      translatedContent: 'Translation Failed - API Key Missing',
      error: 'No API key configured',
    };
  }

  // 본문 길이 제한: 2000자로 추가 단축 (prompt caching과 함께 적용).
  // 입력 토큰 감소 + 출력도 자연스럽게 짧아짐. 핵심 정보는 기사 앞부분에 집중되므로 손실 거의 없음.
  const maxContentLength = 2000;
  const truncatedContent = content && content.length > maxContentLength
    ? content.substring(0, maxContentLength) + '...'
    : (content || summary || '');

  const userPrompt = `Translate the following Vietnamese/English article to Korean news article style (한국식 기사문).

**Output requirements:**
- translatedTitle: 15-30 Korean characters, news headline style
- translatedSummary: 2-3 sentences, summary only (displayed separately from body)
- translatedContent: HTML using <p>, <strong> tags. Body content only — DO NOT include the summary text.

**Style requirements:**
- Authentic Korean news writing: "~다", "~했다", "~밝혔다", "~전망이다"
- Currency format: "1억 동(100 million VND)" — preserve original numbers exactly.

Apply the Vietnamese proper noun rules from the system prompt STRICTLY. Especially:
- Do NOT default to "하노이" for unknown Vietnamese place names.
- Do NOT default to "응우옌/Nguyen" for unknown Vietnamese surnames.
- Use the glossary first. If a word is not in the glossary, KEEP THE VIETNAMESE ORIGINAL.

Return JSON: {"translatedTitle": "...", "translatedSummary": "...", "translatedContent": "..."}

Title: ${title}
Summary: ${summary}
Content: ${truncatedContent}`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // max_tokens 4000 → 3000: 평균 응답이 2500 토큰 미만이라 안전한 헤드룸.
      // 매우 긴 출력 시에만 약간의 잘림 위험이 있으나 본문도 2500자로 줄였으니 균형.
      const raw = await callLLM({ system: SYSTEM_PROMPT_BASE, user: userPrompt, maxTokens: 3000, schema: SCHEMA_FULL });
      const result = JSON.parse(extractJson(raw));
      if (!result.translatedTitle || !result.translatedSummary || !result.translatedContent) {
        throw new Error('Invalid response: missing required fields');
      }
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[Translator/${PROVIDER}] translateFullArticle attempt ${attempt}/${MAX_RETRIES}:`, error.message);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  console.error(`[Translator/${PROVIDER}] translateFullArticle failed`);
  return {
    translatedTitle: 'Translation Failed',
    translatedSummary: 'Translation Failed',
    translatedContent: 'Translation Failed',
    error: lastError?.message,
  };
}

// ════════════════════════════════════════════════════════════════
// translateAndCategorize: 제목 번역 + 확장 카테고리 분류
// ════════════════════════════════════════════════════════════════
export async function translateAndCategorize(item) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return { translatedTitle: null, category: item.category || 'Society' };
  }

  if (isKoreanSource(item.source)) {
    console.log(`[Translator/${PROVIDER}] 한국어 소스 - 번역 스킵: ${item.source}`);
    return { translatedTitle: item.title, category: item.category || 'Society' };
  }

  console.log(`[Translator/${PROVIDER}] 번역 시작: "${item.title.substring(0, 50)}..."`);

  const userPrompt = `Translate this Vietnamese/English news headline to Korean news headline style (한국식 기사 헤드라인) AND classify the category.

**Style requirements:**
- 15-30 Korean characters
- Authentic Korean news headline style
- Korean news terminology where appropriate

Apply the Vietnamese proper noun rules from the system prompt strictly.

**Category options:**
- Society: social issues, accidents, crime, education, daily life
- Economy: business, finance, trade, stock market, companies, economic policy
- Real Estate: property, housing, apartments, land, construction
- Culture: entertainment, sports, lifestyle, fashion, arts
- Politics: politics, diplomacy, law, government policy, elections
- International: world news EXCLUDING Korea and Vietnam
- Korea-Vietnam: relations between Korea and Vietnam, or news involving both
- Community: Korean community in Vietnam, expat news, Korean businesses in Vietnam
- Travel: tourism, travel destinations, hotels
- Health: medical news, health, wellness
- Food: food, cuisine, restaurants, recipes

Return JSON: {"translatedTitle": "<Korean headline>", "category": "<one category>"}

Title: ${item.title}
Summary: ${item.summary || ''}`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await callLLM({ system: SYSTEM_PROMPT_BASE, user: userPrompt, maxTokens: 600, schema: SCHEMA_TITLE_CAT });
      const result = JSON.parse(extractJson(raw));
      if (!result.translatedTitle || typeof result.translatedTitle !== 'string') {
        throw new Error('Invalid response: missing translatedTitle');
      }
      const validCategories = ['Society', 'Economy', 'Real Estate', 'Culture', 'Politics', 'Policy', 'International', 'Korea-Vietnam', 'Community', 'Travel', 'Health', 'Food', 'Other'];
      const normalizedCategory = result.category === 'Policy' ? 'Politics' : result.category;
      const category = validCategories.includes(normalizedCategory) ? normalizedCategory : 'Society';
      console.log(`[Translator/${PROVIDER}] ✅ 번역 완료: "${result.translatedTitle.substring(0, 50)}..." (${category})`);
      return { translatedTitle: result.translatedTitle, category };
    } catch (error) {
      lastError = error;
      console.warn(`[Translator/${PROVIDER}] translateAndCategorize attempt ${attempt}/${MAX_RETRIES}:`, error.message);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  console.error(`[Translator/${PROVIDER}] translateAndCategorize failed:`, item.title?.substring(0, 80));
  return {
    translatedTitle: item.title || '[번역 실패]',
    category: item.category || 'Society',
    error: lastError?.message,
  };
}

// ════════════════════════════════════════════════════════════════
// batchTranslateTitles: 다수 제목 병렬 번역
// ════════════════════════════════════════════════════════════════
export async function batchTranslateTitles(items, batchSize = 15, onProgress = null) {
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const processed = await translateTitle(item);
        if (processed.translatedTitle) successCount++;
        else failCount++;
        return { item, processed };
      })
    );
    results.push(...batchResults);
    if (onProgress) {
      onProgress({
        completed: Math.min(i + batchSize, items.length),
        total: items.length,
        successCount,
        failCount,
      });
    }
  }

  return { results, successCount, failCount };
}

// ════════════════════════════════════════════════════════════════
// translateText: 단일 텍스트 → 한국어 (간단)
// ════════════════════════════════════════════════════════════════
export async function translateText(text) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return text;
  }

  const userPrompt = `Translate this news headline/text to Korean news headline style (한국식 기사 헤드라인).

- 15-30 Korean characters, concise
- Authentic Korean news headline style
- Apply the Vietnamese proper noun rules from the system prompt strictly

Return only the Korean translation as plain text. No JSON, no quotes, no preamble.

Input: ${text}`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const out = await callLLM({ system: SYSTEM_PROMPT_BASE, user: userPrompt, maxTokens: 300, expectJson: false });
      return out.replace(/^["'`]+|["'`]+$/g, '').trim();
    } catch (error) {
      lastError = error;
      console.warn(`[Translator/${PROVIDER}] translateText attempt ${attempt}/${MAX_RETRIES}:`, error.message);
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  console.error(`[Translator/${PROVIDER}] translateText failed after ${MAX_RETRIES} attempts:`, lastError?.message);
  return text;
}

// ════════════════════════════════════════════════════════════════
// translateNewsItem: 호환성 alias
// ════════════════════════════════════════════════════════════════
export async function translateNewsItem(title, summary, content) {
  return translateFullArticle(title, summary, content);
}
