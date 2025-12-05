const { PrismaClient } = require('@prisma/client');
const crawlVnExpress = require('./crawlers/vnexpress');
const crawlYonhap = require('./crawlers/yonhap');
const crawlInsideVina = require('./crawlers/insidevina');
const crawlTuoitre = require('./crawlers/tuoitre');
const crawlThanhNien = require('./crawlers/thanhnien');
const crawlVnaNet = require('./crawlers/vnanet');
const crawlVnExpressVN = require('./crawlers/vnexpress_vn');
const { sendCrawlerAlert } = require('../lib/telegram');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting Multi-Source Crawler (7 Sites)...');

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
      console.log(`✅ ${crawler.name}: ${result.value.length} items`);
    } else {
      const errorMsg = result.reason?.message || String(result.reason);
      const errorStack = result.reason?.stack || '';
      failedSources.push(crawler.name);
      errorDetails[crawler.name] = {
        message: errorMsg,
        stack: errorStack.split('\n').slice(0, 5).join('\n'), // First 5 lines of stack
        time: new Date().toISOString()
      };
      console.error(`❌ ${crawler.name} failed:`, errorMsg);
    }
  });

  console.log(`Total items found: ${allItems.length} (${failedSources.length} sources failed)`);

  let savedCount = 0;

  for (const item of allItems) {
    // Check for duplicates
    const exists = await prisma.newsItem.findFirst({
      where: { originalUrl: item.originalUrl }
    });

    if (!exists) {
      // Auto-categorize Korean news
      if (item.source === 'Yonhap News') {
        item.category = 'Korea-Vietnam';
      }

      await prisma.newsItem.create({
        data: item
      });
      savedCount++;
      console.log(`✅ Saved[${item.source}]: ${item.title} `);
    } else {
      console.log(`Duplicate[${item.source}]: ${item.title} `);
    }
  }

  // Log run
  const status = failedSources.length === 0 ? 'SUCCESS' : 
                 failedSources.length === crawlers.length ? 'FAILED' : 'PARTIAL';
  
  await prisma.crawlerLog.create({
    data: {
      status,
      itemsFound: savedCount,
      message: `Run completed. Success: ${successSources.join(', ') || 'none'}. Failed: ${failedSources.join(', ') || 'none'}`,
      errorDetails: Object.keys(errorDetails).length > 0 ? JSON.stringify(errorDetails, null, 2) : null
    }
  });

  console.log(`🎉 Crawl finished. New items saved: ${savedCount}`);
  if (failedSources.length > 0) {
    console.log(`⚠️ Failed sources: ${failedSources.join(', ')}`);
  }

  // Send Telegram notification
  try {
    await sendCrawlerAlert(status, savedCount, successSources, failedSources, errorDetails);
  } catch (e) {
    console.log('[Telegram] Notification skipped:', e.message);
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
