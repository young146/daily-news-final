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
          content: "You are a professional Korean news translator. Translate ONLY the provided news headline into authentic Korean news style. Do not use your internal knowledge to add or change information. Stick strictly to the input text."
        }, {
          role: "user",
          content: `Translate this news title to Korean in authentic Korean news headline style. 
          
Style guidelines:
- Translate ONLY the provided title. Do not hallucinate or add unrelated information.
- Use concise, objective language (15-30 characters ideal)
- Avoid direct translations - adapt to Korean news conventions
- Use proper Korean news terminology and expressions
- Maintain objectivity and professionalism

**CRITICAL RULES (STRICTLY FOLLOW):**
1. Proper nouns (Foreign): "도널드 트럼프(Donald Trump)", "엘론 머스크(Elon Musk)"
2. Proper nouns (Vietnamese): ALWAYS include Vietnamese original in parentheses.
   - Names: "응우옌반A(Nguyễn Văn A)", "쩐티B(Trần Thị B)"
   - Places: "하노이(Hà Nội)", "호찌민(Hồ Chí Minh)", "다낭(Đà Nẵng)"
3. Currency: ALWAYS show original amount in parentheses.
   - "1억 동(100 million VND)", "50만 달러(500,000 USD)"
4. DO NOT use the names or amounts from the examples above unless they are in the input title.

Return JSON only:
{"title": "Korean translation", "category": "Society/Economy/Culture/Politics/International/Korea-Vietnam/Community"}

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
      const validCategories = ['Society', 'Economy', 'Culture', 'Politics', 'Policy', 'International', 'Korea-Vietnam', 'Community'];
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

  const prompt = `
    You are a professional Korean news translator working for a major Korean news agency.
    Translate the following news item from English/Vietnamese to authentic Korean news style.
    
    **IMPORTANT: Translate ONLY the provided text. Do not use your internal knowledge to add, change, or fabricate information. Do not hallucinate.**
    
    Return the result in JSON format with keys: "translatedTitle", "translatedSummary", "translatedContent".
    
    **Korean News Style Guidelines:**
    
    - "translatedTitle": 
      * Concise headline (15-30 characters ideal)
      * Use authentic Korean news headline style
      * Avoid direct word-for-word translation
      * **CRITICAL: For ALL proper nouns, include original in parentheses**
        - Names: "응우옌반A(Nguyễn Văn A)", "도널드 트럼프(Donald Trump)"
        - Places: "하노이(Hà Nội)", "워싱턴(Washington)"
      * **Currency - show original**: "1억 동(100 million VND)", "50만 달러(500,000 USD)"
    
    - "translatedSummary": 
      * 2-3 sentences summarizing key points
      * Use Korean news summary style: "~에 따르면", "~한 것으로 나타났다", "~밝혔다"
      * End with "~다", "~했다", "~전망이다"
      * **ALL proper nouns with original**: "응우옌반A(Nguyễn Văn A)", "도널드 트럼프(Donald Trump)"
    
    - "translatedContent": 
      * Full body text in authentic Korean news reporting style
      * Use formal Korean news language (ends with "~다", "~했다", "~이다", "~전망이다")
      * Use proper Korean news expressions: "~에 따르면", "~밝혔다/전했다", "~한 것으로 나타났다/알려졌다"
      * Maintain objectivity - avoid personal opinions
      * **CRITICAL: ALL proper nouns MUST include original in parentheses**
        - VIETNAMESE: "응우옌반A(Nguyễn Văn A)", "하노이(Hà Nội)"
      * **Currency MUST show original amount**: "1억 동(100 million VND)"
      * IMPORTANT: Return ONLY clean, semantic HTML (<p>, <h3>, <ul>, <li>, <strong>)
    
    - DO NOT use conversational tone.
    - DO NOT use names from the examples unless they appear in the input text.
    
    Input:
    Title: ${title}
    Summary: ${summary}
    Content: ${content}
  `;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a professional Korean news translator. Translate ONLY the provided news items into authentic Korean news style. Do not hallucinate or use internal knowledge about political figures."
          },
          { role: "user", content: prompt }
        ],
        model: "gpt-4o-mini",
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

  const prompt = `You are a professional Korean news translator. Analyze and translate ONLY this news item into authentic Korean news style.
  
**CRITICAL: Translate ONLY the provided title and summary. Do not use your internal knowledge. Do not hallucinate names that are not in the input.**

Style guidelines for translation:
- Use concise, objective Korean news headline style (15-30 characters ideal)
- Avoid direct word-for-word translation - adapt to Korean news conventions
- Use proper Korean news terminology and expressions

**Proper noun and currency rules (STRICTLY FOLLOW):**
1. Foreign/Vietnamese names: ALWAYS include original in parentheses.
   - Example: "응우옌반A(Nguyễn Văn A)", "도널드 트럼프(Donald Trump)"
2. Foreign/Vietnamese places: ALWAYS include original in parentheses.
   - Example: "하노이(Hà Nội)", "워싱턴(Washington)"
3. Currency: ALWAYS show original amount.
   - Example: "1억 동(100 million VND)", "50만 달러(500,000 USD)"
4. DO NOT use names from the examples unless they are in the input.

Return JSON:
{
  "translatedTitle": "Korean news headline in authentic style",
  "category": "Society/Economy/Culture/Politics/International/Korea-Vietnam/Community/Travel/Health/Food"
}

Category guide:
- Society: social issues, accidents, crime, education
- Economy: business, finance, trade, real estate
- Culture: entertainment, sports, lifestyle, fashion
- Politics: politics, diplomacy, law, government policy
- International: World news EXCLUDING Korea and Vietnam
- Korea-Vietnam: Relations between Korea and Vietnam, or news involving both countries
- Community: Korean community in Vietnam, expat news
- Travel: tourism, travel destinations, hotels, travel tips
- Health: medical news, health information, wellness
- Food: food, cuisine, restaurants, recipes

Title: ${item.title}
Summary: ${item.summary || ''}`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a professional Korean news translator. Translate ONLY the provided headlines into authentic Korean news style. Do not hallucinate or use internal knowledge."
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

      const validCategories = ['Society', 'Economy', 'Culture', 'Politics', 'Policy', 'International', 'Korea-Vietnam', 'Community', 'Travel', 'Health', 'Food', 'Other'];
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

export async function batchTranslateTitles(items, batchSize = 10, onProgress = null) {
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
          content: "You are a professional Korean news translator. Translate ONLY the provided news headline into authentic Korean news style. Do not use your internal knowledge. Do not hallucinate."
        }, {
          role: "user",
          content: `Translate this news headline to Korean in authentic Korean news headline style. 

**CRITICAL RULES (STRICTLY FOLLOW):**
1. Translate ONLY the provided input. Do not add information.
2. Proper nouns (Vietnamese): ALWAYS include original in parentheses.
   - Example: "응우옌반A(Nguyễn Văn A)", "하노이(Hà Nội)"
3. Currency: ALWAYS show original amount.
   - Example: "1억 동(100 million VND)"
4. DO NOT use names from the examples unless they appear in the input.

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
