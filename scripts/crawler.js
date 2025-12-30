const { PrismaClient } = require('@prisma/client');

const crawlVnExpress = require('./crawlers/vnexpress');
const crawlYonhap = require('./crawlers/yonhap');
const crawlInsideVina = require('./crawlers/insidevina');
const crawlTuoitre = require('./crawlers/tuoitre');
const crawlThanhNien = require('./crawlers/thanhnien');
const crawlVnExpressVN = require('./crawlers/vnexpress-vn');
const crawlVnExpressEconomy = require('./crawlers/vnexpress-economy');
const crawlCafef = require('./crawlers/cafef');
const crawlPublicSecurity = require('./crawlers/publicsecurity');
const crawlSaigoneer = require('./crawlers/saigoneer');
const crawlSoraNews24 = require('./crawlers/soranews24');
const crawlTheDodo = require('./crawlers/thedodo');
const crawlPetMD = require('./crawlers/petmd');
const crawlBonAppetit = require('./crawlers/bonappetit');
const crawlHealth = require('./crawlers/health');
const { sendCrawlerAlert } = require('../lib/telegram');

const prisma = new PrismaClient();

let translateAndCategorize;

async function loadTranslator() {
  const translator = await import('../lib/translator.js');
  translateAndCategorize = translator.translateAndCategorize;
}

async function main() {
  await loadTranslator();
  
  console.log('🚀 크롤러 시작 (15개 소스 + AI 번역/요약/분류)...');
  console.log('================================================');

  const crawlers = [
    { name: 'VnExpress', fn: crawlVnExpress },
    { name: 'Yonhap', fn: crawlYonhap },
    { name: 'InsideVina', fn: crawlInsideVina },
    { name: 'TuoiTre', fn: crawlTuoitre },
    { name: 'ThanhNien', fn: crawlThanhNien },
    { name: 'VnExpressVN', fn: crawlVnExpressVN },
    { name: 'VnExpress Economy', fn: crawlVnExpressEconomy },
    { name: 'Cafef', fn: crawlCafef },
    { name: 'PublicSecurity', fn: crawlPublicSecurity },
    { name: 'Saigoneer', fn: crawlSaigoneer },
    { name: 'SoraNews24', fn: crawlSoraNews24 },
    { name: 'The Dodo', fn: crawlTheDodo },
    { name: 'PetMD', fn: crawlPetMD },
    { name: 'Bon Appétit', fn: crawlBonAppetit },
    { name: 'Health', fn: crawlHealth }
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

  // 1단계: 중복 체크 (병렬 처리)
  console.log('\n📋 중복 체크 중...');
  const newItems = [];
  const checkPromises = allItems.map(async (item) => {
    const exists = await prisma.newsItem.findFirst({
      where: { originalUrl: item.originalUrl }
    });
    if (!exists) {
      // 연합뉴스는 Korea-Vietnam 카테고리로 고정
      if (item.source === 'Yonhap News') {
        item.category = 'Korea-Vietnam';
      }
      newItems.push(item);
    }
  });
  await Promise.all(checkPromises);
  console.log(`✅ 중복 체크 완료: ${allItems.length}개 중 ${newItems.length}개 신규`);

  // 2단계: 병렬 번역 (배치 처리) - 성능 개선
  const BATCH_SIZE = 10; // 동시에 10개씩 번역 (배치 크기 증가)
  let savedCount = 0;
  let translatedCount = 0;

  console.log(`\n🔄 병렬 번역 시작 (배치 크기: ${BATCH_SIZE}개)...`);
  
  for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
    const batch = newItems.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(newItems.length / BATCH_SIZE);
    
    console.log(`\n📦 배치 ${batchNum}/${totalBatches} 처리 중 (${batch.length}개)...`);

    // 배치 내 병렬 번역
    const translationResults = await Promise.allSettled(
      batch.map(async (item) => {
        console.log(`   🔄 [${item.source}] ${item.title.substring(0, 40)}...`);
        const processed = await translateAndCategorize(item);
        return { item, processed };
      })
    );

    // 번역 결과 병렬 저장 (순차 저장 대신)
    const savePromises = translationResults.map(async (result) => {
      if (result.status === 'fulfilled') {
        const { item, processed } = result.value;
        
        if (processed.translatedTitle) {
          console.log(`   ✅ [${item.source}] ${processed.translatedTitle.substring(0, 40)}...`);
        }
        
        const finalCategory = item.source === 'Yonhap News' ? 'Korea-Vietnam' : processed.category;
        if (processed.error) {
          console.log(`   ⚠️ 번역 오류: ${processed.error}`);
        }
        
        translatedCount++;

        // 병렬 저장
        await prisma.newsItem.create({
          data: {
            ...item,
            translatedTitle: processed.translatedTitle || null,
            category: finalCategory,
          }
        });
        
        savedCount++;
        return { success: true };
      } else {
        console.error(`   ❌ 번역 실패:`, result.reason);
        return { success: false };
      }
    });

    // 모든 저장 작업 완료 대기
    await Promise.all(savePromises);
    
    console.log(`   ✅ 배치 ${batchNum} 완료 (${savedCount}/${newItems.length}개 저장됨)`);
    
    // 배치 간 짧은 대기 (rate limit 방지) - 딜레이 감소
    if (i + BATCH_SIZE < newItems.length) {
      await new Promise(resolve => setTimeout(resolve, 200)); // 500ms -> 200ms
    }
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
