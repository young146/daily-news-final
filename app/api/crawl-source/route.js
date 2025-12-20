import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { translateTitle } from '@/lib/translator';
import { getVietnamTime } from '@/lib/date-utils';

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
  'thedodo': 'The Dodo',
  'petmd': 'PetMD',
  'vnexpress-travel': 'VnExpress Travel',
  'vnexpress-health': 'VnExpress Health',
};

// VnExpress Travel과 Health 크롤러 - crawl-news와 동일한 로직 사용
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchWithRetry(url, options = {}, retries = 2) {
    const axios = (await import('axios')).default;
    for (let i = 0; i <= retries; i++) {
        try {
            return await axios.get(url, { 
                timeout: 15000,
                headers: { 
                    'User-Agent': USER_AGENT,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    ...options.headers
                },
                ...options
            });
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function fetchDetailPage(url, contentSelectors, options = {}) {
    const cheerio = await import('cheerio');
    try {
        const { data } = await fetchWithRetry(url, options);
        const $ = cheerio.load(data);
        
        let content = null;
        for (const selector of contentSelectors) {
            content = $(selector).html();
            if (content) break;
        }
        
        let imageUrl = $('meta[property="og:image"]').attr('content');
        if (!imageUrl) {
            const firstImg = $('article img, .content img, .fck_detail img').first().attr('src');
            if (firstImg) imageUrl = firstImg;
        }
        
        return { content: content?.trim() || null, imageUrl };
    } catch (e) {
        console.error(`[Crawl] Detail fetch failed for ${url}:`, e.message);
        return { content: null, imageUrl: null };
    }
}


const crawlers = {
  'vnexpress': () => require('@/scripts/crawlers/vnexpress')(),
  'vnexpress-vn': () => require('@/scripts/crawlers/vnexpress-vn')(),
  'yonhap': () => require('@/scripts/crawlers/yonhap')(),
  'insidevina': () => require('@/scripts/crawlers/insidevina')(),
  'tuoitre': () => require('@/scripts/crawlers/tuoitre')(),
  'thanhnien': () => require('@/scripts/crawlers/thanhnien')(),
  'publicsecurity': () => require('@/scripts/crawlers/publicsecurity')(),
  'saigoneer': () => require('@/scripts/crawlers/saigoneer')(),
  'thedodo': () => require('@/scripts/crawlers/thedodo')(),
  'petmd': () => require('@/scripts/crawlers/petmd')(),
  'vnexpress-travel': () => require('@/scripts/crawlers/vnexpress-travel')(),
  'vnexpress-health': () => require('@/scripts/crawlers/vnexpress-health')(),
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
    
    console.log(`[Crawl] ========================================`);
    console.log(`[Crawl] Starting ${source} crawl...`);
    console.log(`[Crawl] Source: ${source}, Crawler exists: ${!!crawlers[source]}`);
    
    const crawlFn = crawlers[source];
    let items = [];
    
    try {
        console.log(`[Crawl] ${source}: Calling crawler function...`);
        items = await crawlFn();
        console.log(`[Crawl] ${source}: Crawler function returned, type: ${typeof items}, isArray: ${Array.isArray(items)}`);
        
        // items가 배열이 아닌 경우 처리
        if (!Array.isArray(items)) {
            console.warn(`[Crawl] ${source}: Crawler returned non-array (${typeof items}), converting to array`);
            console.warn(`[Crawl] ${source}: Returned value:`, items);
            items = [];
        } else {
            console.log(`[Crawl] ${source}: Crawler returned array with ${items.length} items`);
        }
    } catch (error) {
        console.error(`[Crawl] ${source} crawl error:`, error.message);
        console.error(`[Crawl] ${source} error stack:`, error.stack);
        // 에러가 발생해도 빈 배열로 처리하여 계속 진행
        items = [];
    }
    
    console.log(`[Crawl] ${source}: Found ${items.length} items`);
    console.log(`[Crawl] ========================================`);
    
    if (items.length === 0) {
        console.warn(`[Crawl] ${source}: No items found! This might indicate:`);
        console.warn(`  - Selector mismatch with page structure`);
        console.warn(`  - Network/timeout error`);
        console.warn(`  - Page structure changed`);
    }
    
    let savedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    
    for (const item of items) {
      try {
        // 필수 필드 확인
        if (!item.originalUrl) {
          console.warn(`[Crawl] ${source}: Skipping item without originalUrl:`, item.title?.substring(0, 50));
          errorCount++;
          continue;
        }
        
        const existing = await prisma.newsItem.findFirst({
          where: { originalUrl: item.originalUrl }
        });
        
        if (existing) {
          console.log(`⏭️ [Crawl] ${source}: 중복 건너뜀: ${item.originalUrl?.substring(0, 80)}...`);
          duplicateCount++;
          // 중복이어도 내용 업데이트
          try {
            await prisma.newsItem.update({
              where: { id: existing.id },
              data: {
                content: item.content || existing.content,
                imageUrl: item.imageUrl || existing.imageUrl,
                summary: item.summary || existing.summary,
              }
            });
          } catch (updateErr) {
            console.error(`[Crawl] Error updating duplicate item:`, updateErr.message);
          }
        } else {
          let translatedTitle = null;
          let category = item.category || 'Society';
          let translationStatus = 'PENDING';
          
          if (koreanSources.includes(item.source)) {
            translatedTitle = item.title;
            translationStatus = 'COMPLETED';
          } else {
            try {
              const translated = await translateTitle(item);
              if (translated && translated.translatedTitle) {
                translatedTitle = translated.translatedTitle;
                category = translated.category || category;
                translationStatus = 'COMPLETED';
              } else {
                console.warn(`[Crawl] ${source}: 번역 실패 (빈 결과): ${item.title?.substring(0, 50)}`);
                translationStatus = 'PENDING';
              }
            } catch (translateErr) {
              console.error(`[Crawl] ${source}: 번역 에러:`, translateErr.message);
              console.error(`[Crawl] ${source}: 원본 제목: ${item.title?.substring(0, 50)}`);
              translationStatus = 'FAILED';
            }
          }
          
          // 번역 실패해도 저장 (나중에 수동 번역 가능)
          // Prisma에 저장할 데이터 정리 (필수 필드만 포함)
          // 주의: viewCount는 Prisma 스키마에 없으므로 제외
          const dataToSave = {
            title: item.title,
            summary: item.summary || null,
            content: item.content || null,
            originalUrl: item.originalUrl,
            imageUrl: item.imageUrl || null,
            source: item.source || null,
            category: category,
            translatedTitle: translatedTitle || item.title, // 번역 실패 시 원본 제목 사용
            translationStatus: translationStatus,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : getVietnamTime(),
            status: item.status || 'DRAFT'
          };
          
          await prisma.newsItem.create({ 
            data: dataToSave
          });
          console.log(`✅ [Crawl] ${source}: 저장 완료 [${item.source}]: ${(translatedTitle || item.title).substring(0, 50)}...`);
          savedCount++;
        }
      } catch (err) {
        console.error(`[Crawl] ${source}: 저장 에러:`, err.message);
        console.error(`[Crawl] ${source}: 에러 스택:`, err.stack);
        console.error(`[Crawl] ${source}: 에러 아이템:`, {
          title: item.title?.substring(0, 50),
          url: item.originalUrl?.substring(0, 80),
          source: item.source,
          category: item.category,
          hasContent: !!item.content,
          hasImageUrl: !!item.imageUrl,
          publishedAt: item.publishedAt,
          status: item.status
        });
        // Prisma 에러인 경우 더 자세한 정보 출력
        if (err.code) {
          console.error(`[Crawl] ${source}: Prisma 에러 코드:`, err.code);
        }
        if (err.meta) {
          console.error(`[Crawl] ${source}: Prisma 에러 메타:`, err.meta);
        }
        errorCount++;
      }
    }
    
    console.log(`[Crawl] ${source}: 저장 결과 - 신규: ${savedCount}개, 중복: ${duplicateCount}개, 에러: ${errorCount}개`);
    
    // Save to CrawlerLog
    const sourceName = sourceNames[source] || source;
    const logStatus = items.length === 0 ? 'FAILED' : savedCount === 0 ? 'PARTIAL' : 'SUCCESS';
    await prisma.crawlerLog.create({
      data: {
        status: logStatus,
        itemsFound: savedCount,
        message: `${sourceName} crawl completed. Found: ${items.length}, New: ${savedCount}, Duplicates: ${duplicateCount}, Errors: ${errorCount}${items.length === 0 ? ' (No items found - check selectors)' : ''}`,
      }
    });
    
    return NextResponse.json({ 
      success: true, 
      count: savedCount,
      duplicates: duplicateCount,
      errors: errorCount,
      total: items.length,
      message: `${source} crawl completed: ${savedCount} new, ${duplicateCount} duplicates, ${errorCount} errors` 
    });
    
  } catch (error) {
    console.error('[Crawl] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
