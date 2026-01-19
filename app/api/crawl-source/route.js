import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { translateTitle } from '@/lib/translator';

// Vercel Pro Plan: 60초 타임아웃 설정
export const maxDuration = 60;

// 정적 import (Vercel 호환)
import crawlVnExpress from '@/scripts/crawlers/vnexpress';
import crawlVnExpressVN from '@/scripts/crawlers/vnexpress-vn';
import crawlVnExpressEconomy from '@/scripts/crawlers/vnexpress-economy';
import crawlVnExpressRealestate from '@/scripts/crawlers/vnexpress-realestate';
import crawlCafef from '@/scripts/crawlers/cafef';
import crawlCafefRealestate from '@/scripts/crawlers/cafef-realestate';
import crawlYonhap from '@/scripts/crawlers/yonhap';
import crawlInsidevina from '@/scripts/crawlers/insidevina';
import crawlTuoitre from '@/scripts/crawlers/tuoitre';
import crawlThanhnien from '@/scripts/crawlers/thanhnien';
import crawlSaigoneer from '@/scripts/crawlers/saigoneer';
import crawlSoranews24 from '@/scripts/crawlers/soranews24';
import crawlThedodo from '@/scripts/crawlers/thedodo';
import crawlPetmd from '@/scripts/crawlers/petmd';
import crawlBonappetit from '@/scripts/crawlers/bonappetit';
import crawlHealthSource from '@/scripts/crawlers/health';
import crawlVnExpressTravel from '@/scripts/crawlers/vnexpress-travel';
import crawlVnExpressHealth from '@/scripts/crawlers/vnexpress-health';

const koreanSources = ['Yonhap', 'Saigoneer'];

const sourceNames = {
  'vnexpress': 'VnExpress',
  'vnexpress-vn': 'VnExpress VN',
  'vnexpress-economy': 'VnExpress Economy',
  'vnexpress-realestate': 'VnExpress Real Estate',
  'cafef': 'Cafef',
  'cafef-realestate': 'Cafef Real Estate',
  'yonhap': 'Yonhap',
  'insidevina': 'InsideVina',
  'tuoitre': 'TuoiTre',
  'thanhnien': 'ThanhNien',
  'saigoneer': 'Saigoneer',
  'soranews24': 'SoraNews24',
  'thedodo': 'The Dodo',
  'petmd': 'PetMD',
  'vnexpress-travel': 'VnExpress Travel',
  'vnexpress-health': 'VnExpress Health',
  'bonappetit': 'Bon Appétit',
  'health': 'Health',
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
  'vnexpress': crawlVnExpress,
  'vnexpress-vn': crawlVnExpressVN,
  'vnexpress-economy': crawlVnExpressEconomy,
  'vnexpress-realestate': crawlVnExpressRealestate,
  'cafef': crawlCafef,
  'cafef-realestate': crawlCafefRealestate,
  'yonhap': crawlYonhap,
  'insidevina': crawlInsidevina,
  'tuoitre': crawlTuoitre,
  'thanhnien': crawlThanhnien,
  'saigoneer': crawlSaigoneer,
  'soranews24': crawlSoranews24,
  'thedodo': crawlThedodo,
  'petmd': crawlPetmd,
  'vnexpress-travel': crawlVnExpressTravel,
  'vnexpress-health': crawlVnExpressHealth,
  'bonappetit': crawlBonappetit,
  'health': crawlHealthSource,
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
