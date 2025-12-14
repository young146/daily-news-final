import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { translateTitle } from '@/lib/translator';

const koreanSources = ['Yonhap', 'Saigoneer'];

const sourceNames = {
  'vnexpress': 'VnExpress',
  'vnexpress-vn': 'VnExpress VN',
  'yonhap': 'Yonhap',
  'insidevina': 'InsideVina',
  'tuoitre': 'TuoiTre',
  'thanhnien': 'ThanhNien',
  'publicsecurity': 'PublicSecurity',
  'saigoneer': 'Saigoneer',
  'soranews24': 'SoraNews24',
  'google-discovery': 'Google Discovery',
};

const crawlers = {
  'vnexpress': () => require('@/scripts/crawlers/vnexpress')(),
  'vnexpress-vn': () => require('@/scripts/crawlers/vnexpress-vn')(),
  'yonhap': () => require('@/scripts/crawlers/yonhap')(),
  'insidevina': () => require('@/scripts/crawlers/insidevina')(),
  'tuoitre': () => require('@/scripts/crawlers/tuoitre')(),
  'thanhnien': () => require('@/scripts/crawlers/thanhnien')(),
  'publicsecurity': () => require('@/scripts/crawlers/publicsecurity')(),
  'saigoneer': () => require('@/scripts/crawlers/saigoneer')(),
  'soranews24': () => require('@/scripts/crawlers/soranews24')(),
  'google-discovery': () => require('@/scripts/crawlers/google-discovery')(),
};

export async function POST(request) {
  try {
    const { source } = await request.json();

    if (!source || !crawlers[source]) {
      return NextResponse.json({
        success: false,
        error: 'Invalid source'
      }, { status: 400 });
    }

    console.log(`[Crawl] Starting ${source} crawl...`);

    const crawlFn = crawlers[source];
    const items = await crawlFn();

    console.log(`[Crawl] ${source}: Found ${items.length} items`);

    let savedCount = 0;
    for (const item of items) {
      try {
        const existing = await prisma.newsItem.findFirst({
          where: { originalUrl: item.originalUrl }
        });

        if (existing) {
          await prisma.newsItem.update({
            where: { id: existing.id },
            data: {
              content: item.content,
              imageUrl: item.imageUrl,
              summary: item.summary,
            }
          });
          savedCount++;
        } else {
          let translatedTitle = null;
          let category = item.category || 'Society';

          if (koreanSources.includes(item.source)) {
            translatedTitle = item.title;
          } else {
            const translated = await translateTitle(item);
            translatedTitle = translated.translatedTitle;
            category = translated.category || category;
          }

          await prisma.newsItem.create({
            data: {
              ...item,
              translatedTitle,
              category
            }
          });
          console.log(`✅ [${item.source}]: ${(translatedTitle || item.title).substring(0, 50)}...`);
          savedCount++;
        }
      } catch (err) {
        console.error(`[Crawl] Error saving item:`, err.message);
      }
    }

    console.log(`[Crawl] ${source}: Saved ${savedCount} items`);

    // Save to CrawlerLog
    const sourceName = sourceNames[source] || source;
    await prisma.crawlerLog.create({
      data: {
        status: 'SUCCESS',
        itemsFound: savedCount,
        message: `${sourceName} crawl completed. Total: ${items.length}, New: ${savedCount}`,
      }
    });

    return NextResponse.json({
      success: true,
      count: savedCount,
      message: `${source} crawl completed`
    });

  } catch (error) {
    console.error('[Crawl] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
