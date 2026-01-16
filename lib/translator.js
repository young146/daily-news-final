import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isKoreanSource(source) {
  return source === 'Yonhap News' || source === 'InsideVina';
}

export async function translateTitle(item) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Translator] OPENAI_API_KEY not set');
    return { translatedTitle: null, category: item.category || 'Society' };
  }

  if (isKoreanSource(item.source)) {
    return { translatedTitle: item.title, category: item.category || 'Society' };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        messages: [{
          role: "system",
          content: "You are an expert Korean news translator specializing in Vietnamese and English news headlines. Your primary responsibility is ACCURACY. Translate ONLY what is provided. Never add, remove, or fabricate information. Preserve all proper nouns exactly as written with original spelling in parentheses."
        }, {
          role: "user",
          content: `Translate this news title to Korean in authentic Korean news headline style (한국식 기사문).

**CRITICAL ANTI-HALLUCINATION RULES:**
1. Translate EXACTLY what is provided. Do NOT add information not in the input.
2. Do NOT use names, places, or facts from examples unless they appear in the input title.
3. If a Vietnamese name/place is unclear, preserve it EXACTLY as written.
4. When in doubt, preserve the original text rather than guessing.

**Translation Style (한국식 기사문 작성):**
- Write in authentic Korean news headline style (한국식 기사 헤드라인)
- 15-30 Korean characters, concise and impactful
- Authentic Korean news headline style (not conversational)
- Avoid literal word-for-word translation - adapt to Korean conventions
- Use proper Korean news terminology: "~에 따르면", "~밝혔다", "~한 것으로 나타났다"

**Proper Noun and Currency Handling (MANDATORY - 번역 확인을 위해 원어 필수 첨부):**
**IMPORTANT: Always include original text in parentheses for verification purposes. This allows readers to verify translation accuracy.**

1. Vietnamese names: ALWAYS preserve original Vietnamese spelling in parentheses
   - Format: "한국어이름(Vietnamese Original)" - 원어를 괄호 안에 반드시 포함
   - Example: "응우옌반A(Nguyễn Văn A)" - but ONLY if this exact name appears in input
   - Purpose: 번역의 정확성을 확인할 수 있도록 원어 표기 필수
   - If Vietnamese name is unclear, keep original: "Nguyễn Văn A"

2. Vietnamese places: ALWAYS include original in parentheses
   - Format: "한국어지명(Vietnamese Original)" - 원어를 괄호 안에 반드시 포함
   - Example: "하노이(Hà Nội)", "호찌민시(Hồ Chí Minh)"
   - Purpose: 지명 번역의 정확성을 확인할 수 있도록 원어 표기 필수

3. Currency: ALWAYS show original amount in parentheses
   - Format: "한국어금액(Original Amount Original Currency)" - 원어 금액과 통화를 괄호 안에 반드시 포함
   - Example: "1억 동(100 million VND)"
   - Preserve exact numbers from input
   - Purpose: 화폐 및 금액 번역의 정확성을 확인할 수 있도록 원어 표기 필수

**Vietnamese Language Notes:**
- Vietnamese uses diacritics (ă, â, ê, ô, ơ, ư, đ) - preserve them exactly
- Vietnamese word order may differ - adapt to natural Korean

Return JSON only:
{"title": "Korean translation", "category": "Society/Economy/Real Estate/Culture/Politics/International/Korea-Vietnam/Community"}

Title: ${item.title}`
        }],
        model: "gpt-4o-mini",
        max_tokens: 200,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const result = JSON.parse(content);

      if (!result.title || typeof result.title !== 'string') {
        throw new Error('Invalid response structure: missing title');
      }

      // Validate and normalize category
      const validCategories = ['Society', 'Economy', 'Real Estate', 'Culture', 'Politics', 'Policy', 'International', 'Korea-Vietnam', 'Community'];
      const normalizedCategory = result.category === 'Policy' ? 'Politics' : result.category;
      const category = validCategories.includes(normalizedCategory) ? normalizedCategory : 'Society';

      return {
        translatedTitle: result.title,
        category: category
      };
    } catch (error) {
      lastError = error;
      console.warn(`[Translator] Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  console.error(`[Translator] All ${MAX_RETRIES} attempts failed for title:`, item.title?.substring(0, 50));
  console.warn(`[Translator] 번역 실패 - 원본 제목 사용: ${item.title?.substring(0, 50)}`);
  
  // ✅ 번역 실패 시 원본 제목을 반환 (null보다 나음)
  return {
    translatedTitle: item.title || '[번역 실패]',
    category: item.category || 'Society',
    error: lastError?.message
  };
}

export async function translateFullArticle(title, summary, content) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Translator] OPENAI_API_KEY not set, returning fallback values');
    return {
      translatedTitle: "Translation Failed - API Key Missing",
      translatedSummary: "Translation Failed - API Key Missing",
      translatedContent: "Translation Failed - API Key Missing",
      error: "OPENAI_API_KEY is not configured"
    };
  }

  // 간결한 프롬프트로 속도 개선
  const prompt = `Translate to Korean news style (한국식 기사문). Return JSON: {"translatedTitle", "translatedSummary", "translatedContent"}

Rules:
- Title: 15-30자, 뉴스 헤드라인 스타일
- Summary: 2-3문장 요약 (별도 표시됨)
- Content: HTML (<p>, <strong>) - 요약문 중복 금지! 본문만 번역
- 고유명사 원어 병기: "하노이(Hà Nội)", "응우옌(Nguyễn)"
- 금액 원어 병기: "1억 동(100M VND)"
- 정확히 번역, 정보 추가/제거 금지

IMPORTANT: translatedContent에 요약문을 포함하지 마세요. 요약은 translatedSummary에만!

Title: ${title}
Summary: ${summary}
Content: ${content}`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 본문 길이 제한 (속도 개선) - 3000자로 축소
      const maxContentLength = 3000;
      const truncatedContent = content && content.length > maxContentLength 
        ? content.substring(0, maxContentLength) + "..."
        : content;
      
      const finalPrompt = prompt.replace(
        `Content: ${content}`,
        `Content: ${truncatedContent || summary || ''}`
      );
      
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "Korean news translator. Translate accurately. Preserve proper nouns with original: 하노이(Hà Nội). Return JSON only."
          },
          { role: "user", content: finalPrompt }
        ],
        model: "gpt-4o-mini",
        max_tokens: 2000, // 응답 길이 제한으로 속도 개선
        response_format: { type: "json_object" },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from OpenAI');
      }

      const result = JSON.parse(responseContent);

      if (!result.translatedTitle || !result.translatedSummary || !result.translatedContent) {
        throw new Error('Invalid response structure: missing required fields');
      }

      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[Translator] Full article attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  console.error(`[Translator] All ${MAX_RETRIES} attempts failed for full article`);
  return {
    translatedTitle: "Translation Failed",
    translatedSummary: "Translation Failed",
    translatedContent: "Translation Failed",
    error: lastError?.message
  };
}

export async function translateAndCategorize(item) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Translator] OPENAI_API_KEY not set');
    return {
      translatedTitle: null,
      category: item.category || 'Society'
    };
  }

  if (isKoreanSource(item.source)) {
    console.log(`[Translator] 한국어 소스 - 번역 스킵: ${item.source}`);
    return {
      translatedTitle: item.title,
      category: item.category || 'Society'
    };
  }

  console.log(`[Translator] 번역 시작: "${item.title.substring(0, 50)}..."`);

  const prompt = `You are an expert Korean news translator specializing in Vietnamese and English news translation. Your task is to translate ONLY the provided text accurately without adding, removing, or changing any information.

**CRITICAL ANTI-HALLUCINATION RULES (MUST FOLLOW):**
1. Translate EXACTLY what is provided. Do NOT add information not in the input.
2. Do NOT use names, places, or facts from your training data unless they appear in the input.
3. If a Vietnamese name/place is unclear, preserve it EXACTLY as written in the input.
4. Do NOT infer or assume context beyond what is explicitly stated.
5. When in doubt, preserve the original text rather than guessing.

**Translation Style Guidelines (한국식 기사문 작성):**
- Write in authentic Korean news article style (한국식 기사문)
- Headline: 15-30 Korean characters, concise and impactful
- Use authentic Korean news headline conventions (not conversational)
- Avoid literal word-for-word translation - adapt to Korean news style
- Use proper Korean news terminology: "~에 따르면", "~밝혔다", "~한 것으로 나타났다"
- Use formal Korean news language: "~다", "~했다", "~이다", "~전망이다"
- Maintain objectivity and professionalism

**Proper Noun and Currency Handling (MANDATORY - 번역 확인을 위해 원어 필수 첨부):**
**IMPORTANT: Always include original text in parentheses for verification purposes. This allows readers to verify translation accuracy.**

1. Vietnamese names: ALWAYS preserve original Vietnamese spelling in parentheses
   - Format: "한국어이름(Vietnamese Original)" - 원어를 괄호 안에 반드시 포함
   - Example: "응우옌반A(Nguyễn Văn A)", "쩐티B(Trần Thị B)"
   - Purpose: 번역의 정확성을 확인할 수 있도록 원어 표기 필수
   - If Vietnamese name is unclear, keep original as-is: "Nguyễn Văn A"

2. Vietnamese places: ALWAYS include original in parentheses
   - Format: "한국어지명(Vietnamese Original)" - 원어를 괄호 안에 반드시 포함
   - Example: "하노이(Hà Nội)", "호찌민시(Hồ Chí Minh)", "다낭(Đà Nẵng)"
   - Purpose: 지명 번역의 정확성을 확인할 수 있도록 원어 표기 필수

3. Foreign names/places: Include original if not commonly known in Korea
   - Format: "한국어이름/지명(Original)" - 원어를 괄호 안에 포함
   - Example: "도널드 트럼프(Donald Trump)", "워싱턴(Washington)"
   - Purpose: 고유명사 번역의 정확성을 확인할 수 있도록 원어 표기

4. Currency: ALWAYS show original amount in parentheses
   - Format: "한국어금액(Original Amount Original Currency)" - 원어 금액과 통화를 괄호 안에 반드시 포함
   - Example: "1억 동(100 million VND)", "50만 달러(500,000 USD)"
   - Preserve exact numbers from input
   - Purpose: 화폐 및 금액 번역의 정확성을 확인할 수 있도록 원어 표기 필수

**Vietnamese Language Specific:**
- Vietnamese uses diacritics (ă, â, ê, ô, ơ, ư, đ) - preserve them exactly
- Vietnamese word order may differ - adapt to natural Korean
- Vietnamese numbers/currency - convert accurately to Korean format
- Vietnamese dates - convert to Korean date format

**Category Classification:**
Analyze the content and classify into ONE category:
- Society: social issues, accidents, crime, education, daily life
- Economy: business, finance, trade, stock market, companies, economic policy
- Real Estate: real estate, property, housing, apartments, land, construction, building
- Culture: entertainment, sports, lifestyle, fashion, arts
- Politics: politics, diplomacy, law, government policy, elections
- International: World news EXCLUDING Korea and Vietnam
- Korea-Vietnam: Relations between Korea and Vietnam, or news involving both countries
- Community: Korean community in Vietnam, expat news, Korean businesses in Vietnam
- Travel: tourism, travel destinations, hotels, travel tips
- Health: medical news, health information, wellness, diseases
- Food: food, cuisine, restaurants, recipes, culinary news

**Output Format (JSON only):**
{
  "translatedTitle": "Korean news headline in authentic style",
  "category": "One category from the list above"
}

**Input to translate:**
Title: ${item.title}
Summary: ${item.summary || ''}`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are an expert Korean news translator specializing in Vietnamese and English news. Your primary responsibility is ACCURACY. Translate ONLY what is provided. Never add, remove, or fabricate information. Preserve all proper nouns exactly as written. When translating Vietnamese, pay special attention to preserving names and places with their original Vietnamese spelling."
          },
          { role: "user", content: prompt }
        ],
        model: "gpt-4o-mini",
        max_tokens: 500,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const result = JSON.parse(content);

      if (!result.translatedTitle || typeof result.translatedTitle !== 'string') {
        throw new Error('Invalid response: missing translatedTitle');
      }

      const validCategories = ['Society', 'Economy', 'Real Estate', 'Culture', 'Politics', 'Policy', 'International', 'Korea-Vietnam', 'Community', 'Travel', 'Health', 'Food', 'Other'];
      // Policy는 이전 버전과의 호환성을 위해 Politics로 변환
      const normalizedCategory = result.category === 'Policy' ? 'Politics' : result.category;
      const category = validCategories.includes(normalizedCategory) ? normalizedCategory : 'Society';

      console.log(`[Translator] ✅ 번역 완료: "${result.translatedTitle.substring(0, 50)}..." (카테고리: ${category})`);
      
      return {
        translatedTitle: result.translatedTitle,
        category: category
      };
    } catch (error) {
      lastError = error;
      console.warn(`[Translator] Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  console.error(`[Translator] All ${MAX_RETRIES} attempts failed for:`, item.title?.substring(0, 50));
  console.warn(`[Translator] 번역 실패 - 원본 제목 사용: ${item.title?.substring(0, 50)}`);
  
  // ✅ 번역 실패 시 원본 제목을 반환 (null보다 나음)
  return {
    translatedTitle: item.title || '[번역 실패]',
    category: item.category || 'Society',
    error: lastError?.message
  };
}

export async function batchTranslateTitles(items, batchSize = 15, onProgress = null) {
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const processed = await translateTitle(item);
        if (processed.translatedTitle) {
          successCount++;
        } else {
          failCount++;
        }
        return { item, processed };
      })
    );

    results.push(...batchResults);

    if (onProgress) {
      onProgress({
        completed: Math.min(i + batchSize, items.length),
        total: items.length,
        successCount,
        failCount
      });
    }
  }

  return { results, successCount, failCount };
}

export async function translateText(text) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[Translator] OPENAI_API_KEY not set');
    return text;
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        messages: [{
          role: "system",
          content: "You are an expert Korean news translator specializing in Vietnamese and English news headlines. Your primary responsibility is ACCURACY. Translate ONLY what is provided. Never add, remove, or fabricate information. Preserve all proper nouns exactly as written with original spelling in parentheses."
        }, {
          role: "user",
          content: `Translate this news headline to Korean in authentic Korean news headline style (한국식 기사문).

**CRITICAL ANTI-HALLUCINATION RULES:**
1. Translate EXACTLY what is provided. Do NOT add information not in the input.
2. Do NOT use names, places, or facts from examples unless they appear in the input.
3. If a Vietnamese name/place is unclear, preserve it EXACTLY as written.
4. When in doubt, preserve the original text rather than guessing.

**Proper Noun and Currency Handling (MANDATORY - 번역 확인을 위해 원어 필수 첨부):**
**IMPORTANT: Always include original text in parentheses for verification purposes. This allows readers to verify translation accuracy.**

- Vietnamese names: ALWAYS preserve original Vietnamese spelling in parentheses
  - Format: "한국어이름(Vietnamese Original)" - 원어를 괄호 안에 반드시 포함
  - Preserve Vietnamese diacritics (ă, â, ê, ô, ơ, ư, đ) exactly
  - Purpose: 번역의 정확성을 확인할 수 있도록 원어 표기 필수
- Vietnamese places: ALWAYS include original in parentheses
  - Format: "한국어지명(Vietnamese Original)" - 원어를 괄호 안에 반드시 포함
  - Example: "하노이(Hà Nội)", "호찌민시(Hồ Chí Minh)"
  - Purpose: 지명 번역의 정확성을 확인할 수 있도록 원어 표기 필수
- Currency: ALWAYS show original amount in parentheses
  - Format: "한국어금액(Original Amount Original Currency)" - 원어 금액과 통화를 괄호 안에 반드시 포함
  - Example: "1억 동(100 million VND)"
  - Preserve exact numbers from input
  - Purpose: 화폐 및 금액 번역의 정확성을 확인할 수 있도록 원어 표기 필수

**Translation Style (한국식 기사문 작성):**
- Write in authentic Korean news headline style (한국식 기사 헤드라인)
- 15-30 Korean characters, concise and impactful
- Authentic Korean news headline style (not conversational)
- Avoid literal word-for-word translation - adapt to Korean conventions
- Use proper Korean news terminology: "~에 따르면", "~밝혔다", "~한 것으로 나타났다"

Input: "${text}"`
        }],
        model: "gpt-4o-mini",
      });
      return completion.choices[0].message.content.trim();
    } catch (error) {
      lastError = error;
      console.warn(`[Translator] translateText attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  console.error(`[Translator] translateText failed after ${MAX_RETRIES} attempts`);
  return text;
}

export async function translateNewsItem(title, summary, content) {
  return translateFullArticle(title, summary, content);
}
