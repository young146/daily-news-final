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
  return source === 'Yonhap News' || source === 'InsideVina' || source === 'Saigoneer';
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
          content: "You are a professional Korean news translator. Translate news headlines into authentic Korean news style used by major Korean news agencies (Yonhap, Chosun, JoongAng, etc.). Use concise, objective language with proper Korean news terminology."
        }, {
          role: "user",
          content: `Translate this news title to Korean in authentic Korean news headline style. 
          
Style guidelines:
- Use concise, objective language (15-30 characters ideal)
- Avoid direct translations - adapt to Korean news conventions
- Use proper Korean news terminology and expressions
- Maintain objectivity and professionalism
- Examples of good Korean news headlines: "정부, 내년 예산안 확정 발표", "삼성전자, 신제품 출시 계획 밝혀", "한-베 정상회담 개최 예정"

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
  return {
    translatedTitle: null,
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
    You are a professional Korean news translator working for a major Korean news agency (like Yonhap News, Chosun Ilbo, JoongAng Ilbo).
    Translate the following news item from English/Vietnamese to authentic Korean news style.
    
    Return the result in JSON format with keys: "translatedTitle", "translatedSummary", "translatedContent".
    
    **Korean News Style Guidelines:**
    
    - "translatedTitle": 
      * Concise headline (15-30 characters ideal)
      * Use authentic Korean news headline style
      * Examples: "정부, 내년 예산안 확정 발표", "삼성전자 신제품 출시 계획", "한-베 정상회담 개최 예정"
      * Avoid direct word-for-word translation
    
    - "translatedSummary": 
      * 2-3 sentences summarizing key points
      * Use Korean news summary style: "~에 따르면", "~한 것으로 나타났다", "~밝혔다"
      * End with "~다", "~했다", "~전망이다"
    
    - "translatedContent": 
      * Full body text in authentic Korean news reporting style
      * Use formal Korean news language (ends with "~다", "~했다", "~이다", "~전망이다")
      * Use proper Korean news expressions:
        - "~에 따르면" (according to)
        - "~밝혔다/전했다" (stated/announced)
        - "~한 것으로 나타났다/알려졌다" (it was revealed/known that)
        - "~예정이다" (is scheduled to)
        - "~전망이다" (is expected/projected)
      * Maintain objectivity - avoid personal opinions
      * Use proper Korean news terminology and conventions
      * IMPORTANT: Return ONLY clean, semantic HTML
        - Use ONLY <p>, <h3>, <ul>, <li>, <strong> tags
        - DO NOT use <div>, <article>, <span>, or <style> tags
        - DO NOT include class names or IDs
        - DO NOT include images (<img>) inside the content
        - Break content into readable paragraphs
      * DO NOT use conversational tone ("~해요", "~입니다")
      * DO NOT use overly direct translations - adapt to Korean news conventions
    
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
            content: "You are a professional Korean news translator working for a major Korean news agency. Translate news items into authentic Korean news style with proper terminology and conventions."
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
    return {
      translatedTitle: item.title,
      category: item.category || 'Society'
    };
  }

  const prompt = `You are a professional Korean news translator. Analyze and translate this news item into authentic Korean news style used by major Korean news agencies.

Style guidelines for translation:
- Use concise, objective Korean news headline style (15-30 characters ideal)
- Avoid direct word-for-word translation - adapt to Korean news conventions
- Use proper Korean news terminology and expressions
- Examples of good Korean news headlines: "정부, 내년 예산안 확정 발표", "삼성전자, 신제품 출시 계획 밝혀", "한-베 정상회담 개최 예정"
- Maintain objectivity and professionalism

Return JSON:
{
  "translatedTitle": "Korean news headline in authentic style",
  "category": "Society/Economy/Culture/Politics/International/Korea-Vietnam/Community"
}

Category guide:
- Society: social issues, accidents, crime, health, education
- Economy: business, finance, trade, real estate
- Culture: entertainment, sports, tourism, lifestyle
- Politics: politics, diplomacy, law, government policy (was Policy)
- International: World news EXCLUDING Korea and Vietnam
- Korea-Vietnam: Relations between Korea and Vietnam, or news involving both countries
- Community: Korean community in Vietnam, expat news (Kyomin)

Title: ${item.title}
Summary: ${item.summary || ''}`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a professional Korean news translator. Translate news headlines into authentic Korean news style used by major Korean news agencies. Use concise, objective language with proper Korean news terminology."
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

      const validCategories = ['Society', 'Economy', 'Culture', 'Politics', 'Policy', 'International', 'Korea-Vietnam', 'Community'];
      // Policy는 이전 버전과의 호환성을 위해 Politics로 변환
      const normalizedCategory = result.category === 'Policy' ? 'Politics' : result.category;
      const category = validCategories.includes(normalizedCategory) ? normalizedCategory : 'Society';

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

  console.error(`[Translator] All ${MAX_RETRIES} attempts failed`);
  return {
    translatedTitle: null,
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
          content: "You are a professional Korean news translator. Translate news headlines into authentic Korean news style used by major Korean news agencies. Use concise, objective language (15-30 characters ideal) with proper Korean news terminology. Avoid direct translations - adapt to Korean news conventions."
        }, {
          role: "user",
          content: `Translate this news headline to Korean in authentic Korean news headline style. Examples: "정부, 내년 예산안 확정 발표", "삼성전자 신제품 출시 계획", "한-베 정상회담 개최 예정"

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
