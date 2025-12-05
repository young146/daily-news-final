import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

async function crawlVnExpress() {
    const cheerio = await import('cheerio');
    const axios = (await import('axios')).default;
    
    const items = [];
    try {
        console.log('Crawling VnExpress (English)...');
        const { data } = await axios.get('https://e.vnexpress.net/', { 
            timeout: 15000,
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        
        $('.item-news, .item-topstory').each((index, el) => {
            if (index > 5) return;
            
            const titleEl = $(el).find('.title_news_site a');
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            const summary = $(el).find('.lead_news_site a').text().trim();
            const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-original');
            
            if (title && url) {
                let category = 'Society';
                if (url.includes('business')) category = 'Economy';
                if (url.includes('life')) category = 'Culture';
                
                items.push({
                    title,
                    summary: summary || title,
                    originalUrl: url,
                    imageUrl: img || null,
                    source: 'VnExpress',
                    category,
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });
        console.log(`VnExpress (English): ${items.length} items`);
    } catch (e) {
        console.error('VnExpress crawl error:', e.message);
    }
    return items;
}

async function crawlVnExpressVN() {
    const cheerio = await import('cheerio');
    const axios = (await import('axios')).default;
    
    const items = [];
    try {
        console.log('Crawling VnExpress VN...');
        const { data } = await axios.get('https://vnexpress.net/', { 
            timeout: 15000,
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        
        $('.item-news').each((index, el) => {
            if (index > 5) return;
            
            const titleEl = $(el).find('.title-news a');
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            const summary = $(el).find('.description a').text().trim();
            const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            
            if (title && url) {
                items.push({
                    title,
                    summary: summary || title,
                    originalUrl: url,
                    imageUrl: img || null,
                    source: 'VnExpress VN',
                    category: 'Economy',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });
        console.log(`VnExpress VN: ${items.length} items`);
    } catch (e) {
        console.error('VnExpress VN crawl error:', e.message);
    }
    return items;
}

async function crawlYonhap() {
    const cheerio = await import('cheerio');
    const axios = (await import('axios')).default;
    
    const items = [];
    try {
        console.log('Crawling Yonhap News...');
        const { data } = await axios.get('https://www.yna.co.kr/international/asia-australia', { 
            timeout: 15000,
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        
        $('.list-type212 li').each((i, el) => {
            if (i > 5) return;
            
            const titleEl = $(el).find('.tit-news');
            const title = titleEl.text().trim();
            const link = titleEl.attr('href');
            const summary = $(el).find('.lead').text().trim();
            const img = $(el).find('.img-con01 img').attr('src');
            
            if (title && link) {
                items.push({
                    title,
                    summary: summary || title,
                    originalUrl: link,
                    imageUrl: img || null,
                    source: 'Yonhap News',
                    category: 'Korea-Vietnam',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });
        console.log(`Yonhap: ${items.length} items`);
    } catch (e) {
        console.error('Yonhap crawl error:', e.message);
    }
    return items;
}

async function crawlInsideVina() {
    const cheerio = await import('cheerio');
    const axios = (await import('axios')).default;
    
    const items = [];
    try {
        console.log('Crawling InsideVina...');
        const { data } = await axios.get('https://www.insidevina.com/news/articleList.html?sc_section_code=S1N2', { 
            timeout: 15000,
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        
        $('#section-list .article-list li, .type2 li').each((i, el) => {
            if (i > 5) return;
            
            const titleEl = $(el).find('.titles a, .article-title a');
            const title = titleEl.text().trim();
            const link = titleEl.attr('href');
            const summary = $(el).find('.sub-title, .article-summary').text().trim();
            const img = $(el).find('img').attr('src');
            
            if (title && link) {
                items.push({
                    title,
                    summary: summary || title,
                    originalUrl: link.startsWith('http') ? link : `https://www.insidevina.com${link}`,
                    imageUrl: img ? (img.startsWith('http') ? img : `https://www.insidevina.com${img}`) : null,
                    source: 'InsideVina',
                    category: 'Korea-Vietnam',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });
        console.log(`InsideVina: ${items.length} items`);
    } catch (e) {
        console.error('InsideVina crawl error:', e.message);
    }
    return items;
}

async function crawlTuoitre() {
    const cheerio = await import('cheerio');
    const axios = (await import('axios')).default;
    
    const items = [];
    try {
        console.log('Crawling TuoiTre...');
        const { data } = await axios.get('https://tuoitre.vn/', { 
            timeout: 15000,
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        
        $('.box-category-item, .news-item, .box-focus-item').each((i, el) => {
            if (i > 5) return;
            
            const titleEl = $(el).find('h3 a, .title-name a, h2 a');
            const title = titleEl.text().trim();
            const link = titleEl.attr('href');
            const summary = $(el).find('.sapo, .description').text().trim();
            const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            
            if (title && link) {
                items.push({
                    title,
                    summary: summary || title,
                    originalUrl: link.startsWith('http') ? link : `https://tuoitre.vn${link}`,
                    imageUrl: img || null,
                    source: 'TuoiTre',
                    category: 'Society',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });
        console.log(`TuoiTre: ${items.length} items`);
    } catch (e) {
        console.error('TuoiTre crawl error:', e.message);
    }
    return items;
}

async function crawlThanhNien() {
    const cheerio = await import('cheerio');
    const axios = (await import('axios')).default;
    
    const items = [];
    try {
        console.log('Crawling ThanhNien...');
        const { data } = await axios.get('https://thanhnien.vn/', { 
            timeout: 15000,
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        
        $('.story, .box-news .item, article').each((index, el) => {
            if (index > 5) return;
            
            const titleEl = $(el).find('.story__heading a, .title a, h3 a, h2 a');
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            const summary = $(el).find('.story__summary, .sapo, .summary').text().trim();
            const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
            
            if (title && url) {
                const fullUrl = url.startsWith('http') ? url : `https://thanhnien.vn${url}`;
                items.push({
                    title,
                    summary: summary || title,
                    originalUrl: fullUrl,
                    imageUrl: img || null,
                    source: 'ThanhNien',
                    category: 'Society',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });
        
        // Fallback if specific classes fail
        if (items.length === 0) {
            $('h3 a, h2 a').each((index, el) => {
                if (index > 5) return;
                const title = $(el).text().trim();
                const url = $(el).attr('href');
                if (title && url && url.includes('thanhnien.vn')) {
                    const fullUrl = url.startsWith('http') ? url : `https://thanhnien.vn${url}`;
                    items.push({
                        title,
                        summary: title,
                        originalUrl: fullUrl,
                        imageUrl: null,
                        source: 'ThanhNien',
                        category: 'Society',
                        publishedAt: new Date(),
                        status: 'DRAFT'
                    });
                }
            });
        }
        console.log(`ThanhNien: ${items.length} items`);
    } catch (e) {
        console.error('ThanhNien crawl error:', e.message);
    }
    return items;
}

async function crawlVnaNet() {
    const cheerio = await import('cheerio');
    const axios = (await import('axios')).default;
    const https = await import('https');
    
    const items = [];
    try {
        console.log('Crawling VNA...');
        const agent = new https.Agent({ 
            rejectUnauthorized: false
        });
        const { data } = await axios.get('https://vnanet.vn/vi/anh-thoi-su', { 
            timeout: 15000,
            httpsAgent: agent,
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        
        $('.box-news-item, .news-item, .story-item, article').each((i, el) => {
            if (i > 5) return;
            
            const titleEl = $(el).find('h3 a, .title a, h2 a');
            const title = titleEl.text().trim();
            const link = titleEl.attr('href');
            const summary = $(el).find('.sapo, .description, .lead').text().trim();
            const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
            
            if (title && link) {
                items.push({
                    title,
                    summary: summary || title,
                    originalUrl: link.startsWith('http') ? link : `https://vnanet.vn${link}`,
                    imageUrl: img || null,
                    source: 'VNA',
                    category: 'Policy',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });
        console.log(`VNA: ${items.length} items`);
    } catch (e) {
        console.error('VNA crawl error:', e.message);
    }
    return items;
}

export async function POST(request) {
    try {
        console.log('🚀 Starting News Crawl (7 Sources)...');
        
        const [vnItems, vnvnItems, yhItems, ivItems, ttItems, tnItems, vnaItems] = await Promise.all([
            crawlVnExpress(),
            crawlVnExpressVN(),
            crawlYonhap(),
            crawlInsideVina(),
            crawlTuoitre(),
            crawlThanhNien(),
            crawlVnaNet()
        ]);
        
        const allItems = [...vnItems, ...vnvnItems, ...yhItems, ...ivItems, ...ttItems, ...tnItems, ...vnaItems];
        console.log(`Total items found: ${allItems.length}`);
        
        let savedCount = 0;
        const sources = {
            'VnExpress': vnItems.length,
            'VnExpress VN': vnvnItems.length,
            'Yonhap News': yhItems.length,
            'InsideVina': ivItems.length,
            'TuoiTre': ttItems.length,
            'ThanhNien': tnItems.length,
            'VNA': vnaItems.length
        };
        
        for (const item of allItems) {
            const exists = await prisma.newsItem.findFirst({
                where: { originalUrl: item.originalUrl }
            });
            
            if (!exists) {
                await prisma.newsItem.create({ data: item });
                savedCount++;
                console.log(`✅ Saved[${item.source}]: ${item.title.substring(0, 50)}...`);
            }
        }
        
        await prisma.crawlerLog.create({
            data: {
                status: 'SUCCESS',
                itemsFound: savedCount,
                message: `API Crawl completed. Total: ${allItems.length}, New: ${savedCount}`
            }
        });
        
        console.log(`🎉 Crawl finished. New items: ${savedCount}`);
        
        return Response.json({
            success: true,
            message: `뉴스 수집 완료!`,
            total: allItems.length,
            newItems: savedCount,
            sources
        });
        
    } catch (error) {
        console.error('Crawl failed:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
