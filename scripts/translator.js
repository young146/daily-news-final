const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function translateTitle(title, source) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[Translator] No API key, skipping translation');
    return title;
  }

  if (source === 'Yonhap News') {
    return title;
  }

  try {
    const completion = await openai.chat.completions.create({
      messages: [{
        role: "user",
        content: `Translate this news headline to Korean. Keep it concise and professional (news style). Only return the translated text, nothing else.

Headline: "${title}"`
      }],
      model: "gpt-4o-mini",
      max_tokens: 200,
    });
    
    const translated = completion.choices[0].message.content.trim();
    return translated.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error(`[Translator] Failed to translate: ${error.message}`);
    return title;
  }
}

async function translateTitlesInBatch(items) {
  const results = [];
  
  for (const item of items) {
    const translatedTitle = await translateTitle(item.title, item.source);
    results.push({
      ...item,
      translatedTitle: translatedTitle,
    });
    
    if (translatedTitle !== item.title) {
      console.log(`[번역] ${item.title.substring(0, 30)}... → ${translatedTitle.substring(0, 30)}...`);
    }
  }
  
  return results;
}

module.exports = {
  translateTitle,
  translateTitlesInBatch,
};
