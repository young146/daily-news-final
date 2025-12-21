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

async function crawlVnExpressTravel() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('[Crawl] Crawling VnExpress Travel...');
        const { data } = await fetchWithRetry('https://vnexpress.net/du-lich');
        const $ = cheerio.load(data);
        
        console.log('[Crawl] Page loaded, checking selectors...');
        
        const listItems = [];
        const seen = new Set();
        
        // 디버깅: 각 선택자로 찾은 요소 수 확인
        const selectors = ['.item-news', '.item-topstory', 'article.item-news', 'h3 a', 'h2 a', '.title-news a', '.title_news a'];
        selectors.forEach(selector => {
            const count = $(selector).length;
            if (count > 0) {
                console.log(`[Crawl] Selector "${selector}": found ${count} elements`);
            }
        });
        
        $('.item-news, .item-topstory, article.item-news, h3 a, h2 a, .title-news a, .title_news a').each((index, el) => {
            if (listItems.length >= 10) return false;
            
            let titleEl, url;
            if ($(el).is('a')) {
                titleEl = $(el);
                url = $(el).attr('href');
            } else {
                titleEl = $(el).find('.title-news a, .title_news a, h3 a, h2 a, a').first();
                url = titleEl.attr('href');
            }
            
            const title = titleEl.text().trim();
            const summary = $(el).find('.description a, .lead_news_site a').text().trim() || '';
            
            if (title && url && title.length > 20 && !seen.has(url)) {
                seen.add(url);
                if (!url.startsWith('http')) {
                    url = `https://vnexpress.net${url}`;
                }
                listItems.push({ title, summary, url });
                console.log(`[Crawl] Found item ${listItems.length}: ${title.substring(0, 50)}...`);
            }
        });
        
        console.log(`[Crawl] Total list items found: ${listItems.length}`);
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const detail = await fetchDetailPage(item.url, ['.fck_detail', 'article.fck_detail', '.content_detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'VnExpress Travel',
                category: 'Travel',
                viewCount: i + 1,
                publishedAt: new Date(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`[Crawl] VnExpress Travel: ${items.length} items`);
    } catch (e) {
        console.error('[Crawl] VnExpress Travel crawl error:', e.message);
        console.error('[Crawl] Error stack:', e.stack);
    }
    return items;
}

async function crawlVnExpressHealth() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('[Crawl] Crawling VnExpress Health...');
        const { data } = await fetchWithRetry('https://vnexpress.net/suc-khoe');
        const $ = cheerio.load(data);
        
        console.log('[Crawl] Page loaded, checking selectors...');
        
        const listItems = [];
        const seen = new Set();
        
        // 디버깅: 각 선택자로 찾은 요소 수 확인
        const selectors = ['.item-news', '.item-topstory', 'article.item-news', 'h3 a', 'h2 a', '.title-news a', '.title_news a'];
        selectors.forEach(selector => {
            const count = $(selector).length;
            if (count > 0) {
                console.log(`[Crawl] Selector "${selector}": found ${count} elements`);
            }
        });
        
        $('.item-news, .item-topstory, article.item-news, h3 a, h2 a, .title-news a, .title_news a').each((index, el) => {
            if (listItems.length >= 10) return false;
            
            let titleEl, url;
            if ($(el).is('a')) {
                titleEl = $(el);
                url = $(el).attr('href');
            } else {
                titleEl = $(el).find('.title-news a, .title_news a, h3 a, h2 a, a').first();
                url = titleEl.attr('href');
            }
            
            const title = titleEl.text().trim();
            const summary = $(el).find('.description a, .lead_news_site a').text().trim() || '';
            
            if (title && url && title.length > 20 && !seen.has(url)) {
                seen.add(url);
                if (!url.startsWith('http')) {
                    url = `https://vnexpress.net${url}`;
                }
                listItems.push({ title, summary, url });
                console.log(`[Crawl] Found item ${listItems.length}: ${title.substring(0, 50)}...`);
            }
        });
        
        console.log(`[Crawl] Total list items found: ${listItems.length}`);
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const detail = await fetchDetailPage(item.url, ['.fck_detail', 'article.fck_detail', '.content_detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'VnExpress Health',
                category: 'Health',
                viewCount: i + 1,
                publishedAt: new Date(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`[Crawl] VnExpress Health: ${items.length} items`);
    } catch (e) {
        console.error('[Crawl] VnExpress Health crawl error:', e.message);
        console.error('[Crawl] Error stack:', e.stack);
    }
    return items;
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
  'soranews24': () => require('@/scripts/crawlers/soranews24')(),
  'thedodo': () => require('@/scripts/crawlers/thedodo')(),
  'petmd': () => require('@/scripts/crawlers/petmd')(),
  'vnexpress-travel': () => crawlVnExpressTravel(),
  'vnexpress-health': () => crawlVnExpressHealth(),
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
    
    console.log(`[Crawl] ${source}: Saved ${savedCount} items (${items.length - savedCount} duplicates)`);
    
    // Save to CrawlerLog
    const sourceName = sourceNames[source] || source;
    const logStatus = items.length === 0 ? 'FAILED' : savedCount === 0 ? 'PARTIAL' : 'SUCCESS';
    await prisma.crawlerLog.create({
      data: {
        status: logStatus,
        itemsFound: savedCount,
        message: `${sourceName} crawl completed. Found: ${items.length}, New: ${savedCount}${items.length === 0 ? ' (No items found - check selectors)' : ''}`,
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
