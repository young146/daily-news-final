const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai');

const crawlVnExpress = require('./crawlers/vnexpress');
const crawlYonhap = require('./crawlers/yonhap');
const crawlInsideVina = require('./crawlers/insidevina');
const crawlTuoitre = require('./crawlers/tuoitre');
const crawlThanhNien = require('./crawlers/thanhnien');
const crawlVnaNet = require('./crawlers/vnanet');
const crawlVnExpressVN = require('./crawlers/vnexpress-vn');
const { sendCrawlerAlert } = require('../lib/telegram');

const prisma = new PrismaClient();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function translateAndProcess(item) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[번역] API 키 없음, 원문 유지');
    return { translatedTitle: null, translatedSummary: null, category: item.category || 'Society' };
  }

  const isKorean = item.source === 'Yonhap News' || item.source === 'InsideVina';
  
  try {
    const prompt = isKorean 
      ? `다음 뉴스를 분석해주세요:

제목: "${item.title}"
내용: "${(item.content || item.summary || '').substring(0, 1000)}"

다음 형식으로 JSON만 반환하세요:
{
  "title": "제목 (이미 한국어면 그대로, 아니면 번역)",
  "summary": "2-3문장 한국어 요약 (핵심 내용만)",
  "category": "Society/Economy/Culture/Policy 중 하나"
}

카테고리 기준:
- Society: 사회, 사건사고, 건강, 교육, 환경
- Economy: 경제, 기업, 금융, 부동산, 기술
- Culture: 문화, 엔터테인먼트, 스포츠, 관광, 음식
- Policy: 정치, 외교, 법률, 정부정책`
      : `Analyze this news article:

Title: "${item.title}"
Content: "${(item.content || item.summary || '').substring(0, 1000)}"

Return ONLY a JSON object in this exact format:
{
  "title": "Korean translation of the title (professional news style)",
  "summary": "2-3 sentence summary in Korean (key points only)",
  "category": "One of: Society/Economy/Culture/Policy"
}

Category guidelines:
- Society: social issues, accidents, health, education, environment
- Economy: business, finance, real estate, technology, trade
- Culture: entertainment, sports, tourism, food, lifestyle
- Policy: politics, diplomacy, law, government policy`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4o-mini",
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(completion.choices[0].message.content);
    
    return {
      translatedTitle: result.title?.replace(/^["']|["']$/g, '') || item.title,
      translatedSummary: result.summary || null,
      category: ['Society', 'Economy', 'Culture', 'Policy'].includes(result.category) 
        ? result.category 
        : (item.category || 'Society')
    };
  } catch (error) {
    console.error(`[처리 실패] ${error.message}`);
    return { translatedTitle: null, translatedSummary: null, category: item.category || 'Society' };
  }
}

async function main() {
  console.log('🚀 크롤러 시작 (7개 소스 + AI 번역/요약/분류)...');
  console.log('================================================');

  const crawlers = [
    { name: 'VnExpress', fn: crawlVnExpress },
    { name: 'Yonhap', fn: crawlYonhap },
    { name: 'InsideVina', fn: crawlInsideVina },
    { name: 'TuoiTre', fn: crawlTuoitre },
    { name: 'ThanhNien', fn: crawlThanhNien },
    { name: 'VNA', fn: crawlVnaNet },
    { name: 'VnExpressVN', fn: crawlVnExpressVN }
  ];

  const results = await Promise.allSettled(crawlers.map(c => c.fn()));
  
  const allItems = [];
  const successSources = [];
  const failedSources = [];
  const errorDetails = {};

  results.forEach((result, index) => {
    const crawler = crawlers[index];
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
      successSources.push(`${crawler.name}(${result.value.length})`);
      console.log(`✅ ${crawler.name}: ${result.value.length}개 수집`);
    } else {
      const errorMsg = result.reason?.message || String(result.reason);
      const errorStack = result.reason?.stack || '';
      failedSources.push(crawler.name);
      errorDetails[crawler.name] = {
        message: errorMsg,
        stack: errorStack.split('\n').slice(0, 5).join('\n'),
        time: new Date().toISOString()
      };
      console.error(`❌ ${crawler.name} 실패:`, errorMsg);
    }
  });

  console.log('================================================');
  console.log(`📰 총 수집: ${allItems.length}개 (${failedSources.length}개 소스 실패)`);
  console.log('================================================');

  let savedCount = 0;
  let translatedCount = 0;

  for (const item of allItems) {
    const exists = await prisma.newsItem.findFirst({
      where: { originalUrl: item.originalUrl }
    });

    if (exists) {
      continue;
    }

    // 연합뉴스는 Korea-Vietnam 카테고리로 고정
    if (item.source === 'Yonhap News') {
      item.category = 'Korea-Vietnam';
    }

    console.log(`\n📝 [${item.source}] ${item.title.substring(0, 50)}...`);

    // GPT로 제목 번역 + 요약 생성 + 카테고리 분류
    const processed = await translateAndProcess(item);
    
    if (processed.translatedTitle) {
      console.log(`   → 제목: ${processed.translatedTitle.substring(0, 50)}...`);
    }
    if (processed.translatedSummary) {
      console.log(`   → 요약: ${processed.translatedSummary.substring(0, 50)}...`);
    }
    // 연합뉴스가 아니면 AI 분류 카테고리 사용
    const finalCategory = item.source === 'Yonhap News' ? 'Korea-Vietnam' : processed.category;
    console.log(`   → 카테고리: ${finalCategory}`);
    translatedCount++;

    await prisma.newsItem.create({
      data: {
        ...item,
        translatedTitle: processed.translatedTitle || null,
        translatedSummary: processed.translatedSummary || null,
        category: finalCategory,
      }
    });
    
    savedCount++;
    console.log(`   ✅ 저장 완료`);
  }

  const status = failedSources.length === 0 ? 'SUCCESS' : 
                 failedSources.length === crawlers.length ? 'FAILED' : 'PARTIAL';
  
  await prisma.crawlerLog.create({
    data: {
      status,
      itemsFound: savedCount,
      message: `완료. 성공: ${successSources.join(', ') || '없음'}. 실패: ${failedSources.join(', ') || '없음'}. 번역: ${translatedCount}개`,
      errorDetails: Object.keys(errorDetails).length > 0 ? JSON.stringify(errorDetails, null, 2) : null
    }
  });

  console.log('================================================');
  console.log(`🎉 크롤링 완료!`);
  console.log(`   - 새 뉴스 저장: ${savedCount}개`);
  console.log(`   - 제목 번역: ${translatedCount}개`);
  if (failedSources.length > 0) {
    console.log(`   - 실패 소스: ${failedSources.join(', ')}`);
  }
  console.log('================================================');

  try {
    await sendCrawlerAlert(status, savedCount, successSources, failedSources, errorDetails);
  } catch (e) {
    console.log('[텔레그램] 알림 스킵:', e.message);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
