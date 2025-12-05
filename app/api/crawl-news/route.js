import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchWithRetry(url, options = {}, retries = 2) {
    const axios = (await import('axios')).default;
    for (let i = 0; i <= retries; i++) {
        try {
            return await axios.get(url, { 
                timeout: 15000,
                headers: { 'User-Agent': USER_AGENT },
                ...options
            });
        } catch (e) {
            if (i === retries) throw e;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function fetchDetailPage(url, contentSelectors, imageSelector = 'meta[property="og:image"]') {
    const cheerio = await import('cheerio');
    try {
        const { data } = await fetchWithRetry(url);
        const $ = cheerio.load(data);
        
        let content = null;
        for (const selector of contentSelectors) {
            content = $(selector).html();
            if (content) break;
        }
        
        let imageUrl = $(imageSelector).attr('content') || $('meta[property="og:image"]').attr('content');
        if (!imageUrl) {
            const firstImg = $('article img, .content img, .fck_detail img').first().attr('src');
            if (firstImg) imageUrl = firstImg;
        }
        
        return { content: content?.trim() || null, imageUrl };
    } catch (e) {
        console.error(`Detail fetch failed for ${url}:`, e.message);
        return { content: null, imageUrl: null };
    }
}

async function crawlVnExpress() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling VnExpress (English)...');
        const { data } = await fetchWithRetry('https://e.vnexpress.net/');
        const $ = cheerio.load(data);
        
        const listItems = [];
        $('.item-news, .item-topstory').each((index, el) => {
            if (index >= 6) return;
            
            const titleEl = $(el).find('.title_news_site a');
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            const summary = $(el).find('.lead_news_site a').text().trim() || $(el).find('.description a').text().trim();
            
            if (title && url) {
                let category = 'Society';
                if (url.includes('business')) category = 'Economy';
                if (url.includes('life')) category = 'Culture';
                
                listItems.push({ title, summary, url, category });
            }
        });
        
        for (const item of listItems) {
            const detail = await fetchDetailPage(item.url, ['.fck_detail', '.content_detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'VnExpress',
                category: item.category,
                publishedAt: new Date(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`VnExpress (English): ${items.length} items`);
    } catch (e) {
        console.error('VnExpress crawl error:', e.message);
    }
    return items;
}

async function crawlVnExpressVN() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling VnExpress VN...');
        const { data } = await fetchWithRetry('https://vnexpress.net/');
        const $ = cheerio.load(data);
        
        const listItems = [];
        $('.item-news').each((index, el) => {
            if (index >= 6) return;
            
            const titleEl = $(el).find('.title-news a');
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            const summary = $(el).find('.description a').text().trim();
            
            if (title && url) {
                listItems.push({ title, summary, url });
            }
        });
        
        for (const item of listItems) {
            const detail = await fetchDetailPage(item.url, ['.fck_detail', 'article.fck_detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'VnExpress VN',
                category: 'Economy',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`VnExpress VN: ${items.length} items`);
    } catch (e) {
        console.error('VnExpress VN crawl error:', e.message);
    }
    return items;
}

async function crawlYonhap() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling Yonhap News...');
        const { data } = await fetchWithRetry('https://www.yna.co.kr/international/asia-australia');
        const $ = cheerio.load(data);
        
        const listItems = [];
        $('.list-type038 li, .list-type212 li').each((i, el) => {
            if (i >= 6) return;
            
            const titleEl = $(el).find('.tit-news a, .news-tl a');
            const title = titleEl.text().trim();
            let link = titleEl.attr('href');
            const summary = $(el).find('.lead').text().trim();
            
            if (title && link) {
                if (!link.startsWith('http')) {
                    link = `https://www.yna.co.kr${link}`;
                }
                listItems.push({ title, summary, url: link });
            }
        });
        
        for (const item of listItems) {
            const detail = await fetchDetailPage(item.url, ['.article-txt', '.story-news', '.article']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'Yonhap News',
                category: 'Korea-Vietnam',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`Yonhap: ${items.length} items`);
    } catch (e) {
        console.error('Yonhap crawl error:', e.message);
    }
    return items;
}

async function crawlInsideVina() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling InsideVina...');
        const { data } = await fetchWithRetry('https://www.insidevina.com/news/articleList.html?sc_section_code=S1N2');
        const $ = cheerio.load(data);
        
        const listItems = [];
        $('#section-list .article-list li, .type2 li, .ArtList li').each((i, el) => {
            if (i >= 6) return;
            
            const titleEl = $(el).find('.titles a, .article-title a, a.tit');
            const title = titleEl.text().trim();
            let link = titleEl.attr('href');
            const summary = $(el).find('.sub-title, .article-summary').text().trim();
            
            if (title && link) {
                if (!link.startsWith('http')) {
                    link = `https://www.insidevina.com${link}`;
                }
                listItems.push({ title, summary, url: link });
            }
        });
        
        for (const item of listItems) {
            const detail = await fetchDetailPage(item.url, ['#article-view-content-div', '.article-body', '.article-view-body']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'InsideVina',
                category: 'Korea-Vietnam',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`InsideVina: ${items.length} items`);
    } catch (e) {
        console.error('InsideVina crawl error:', e.message);
    }
    return items;
}

async function crawlTuoitre() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling TuoiTre...');
        const { data } = await fetchWithRetry('https://tuoitre.vn/');
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        $('.box-category-item, .news-item, .box-focus-item, .box-content-item').each((i, el) => {
            if (listItems.length >= 6) return;
            
            const titleEl = $(el).find('h3 a, .title-name a, h2 a').first();
            const title = titleEl.text().trim();
            let link = titleEl.attr('href');
            const summary = $(el).find('.sapo, .description').text().trim();
            
            if (title && link && !seen.has(link)) {
                seen.add(link);
                if (!link.startsWith('http')) {
                    link = `https://tuoitre.vn${link}`;
                }
                listItems.push({ title, summary, url: link });
            }
        });
        
        for (const item of listItems) {
            const detail = await fetchDetailPage(item.url, ['.detail-content', '#main-detail-body', '.content-detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'TuoiTre',
                category: 'Society',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`TuoiTre: ${items.length} items`);
    } catch (e) {
        console.error('TuoiTre crawl error:', e.message);
    }
    return items;
}

async function crawlThanhNien() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling ThanhNien...');
        const { data } = await fetchWithRetry('https://thanhnien.vn/');
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        $('.story, .box-category-item, article.story').each((index, el) => {
            if (listItems.length >= 6) return;
            
            const titleEl = $(el).find('.story__heading a, .story__title a, h3 a, h2 a').first();
            const title = titleEl.text().trim();
            let url = titleEl.attr('href');
            const summary = $(el).find('.story__summary, .sapo').text().trim();
            
            if (title && url && !seen.has(url)) {
                seen.add(url);
                if (!url.startsWith('http')) {
                    url = `https://thanhnien.vn${url}`;
                }
                listItems.push({ title, summary, url });
            }
        });
        
        for (const item of listItems) {
            const detail = await fetchDetailPage(item.url, ['.detail-content', '.content-detail', '#main-detail-body', '.detail__cmain-main']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'ThanhNien',
                category: 'Society',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`ThanhNien: ${items.length} items`);
    } catch (e) {
        console.error('ThanhNien crawl error:', e.message);
    }
    return items;
}

async function crawlVnaNet() {
    const cheerio = await import('cheerio');
    const https = await import('https');
    const items = [];
    try {
        console.log('Crawling VNA...');
        const agent = new https.Agent({ rejectUnauthorized: false });
        const axios = (await import('axios')).default;
        
        const { data } = await axios.get('https://vnanet.vn/vi/anh', { 
            timeout: 15000,
            httpsAgent: agent,
            headers: { 'User-Agent': USER_AGENT }
        });
        const $ = cheerio.load(data);
        
        const listItems = [];
        $('.story-item, .box-news-item, article, .item-news').each((i, el) => {
            if (listItems.length >= 6) return;
            
            const titleEl = $(el).find('h3 a, .title a, h2 a, a.story-title').first();
            const title = titleEl.text().trim();
            let link = titleEl.attr('href');
            const summary = $(el).find('.sapo, .description, .lead').text().trim();
            
            if (title && link) {
                if (!link.startsWith('http')) {
                    link = `https://vnanet.vn${link}`;
                }
                listItems.push({ title, summary, url: link });
            }
        });
        
        for (const item of listItems) {
            try {
                const { data: detailData } = await axios.get(item.url, {
                    timeout: 15000,
                    httpsAgent: agent,
                    headers: { 'User-Agent': USER_AGENT }
                });
                const $d = cheerio.load(detailData);
                const content = $d('.story-content, .article-content, .detail-content').html();
                const imageUrl = $d('meta[property="og:image"]').attr('content');
                
                items.push({
                    title: item.title,
                    summary: item.summary || item.title,
                    content: content?.trim() || null,
                    originalUrl: item.url,
                    imageUrl: imageUrl || null,
                    source: 'VNA',
                    category: 'Policy',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`VNA detail failed: ${e.message}`);
            }
        }
        console.log(`VNA: ${items.length} items`);
    } catch (e) {
        console.error('VNA crawl error:', e.message);
    }
    return items;
}

export async function POST(request) {
    try {
        console.log('🚀 Starting News Crawl (7 Sources with Detail Pages)...');
        
        const results = await Promise.all([
            crawlVnExpress(),
            crawlVnExpressVN(),
            crawlYonhap(),
            crawlInsideVina(),
            crawlTuoitre(),
            crawlThanhNien(),
            crawlVnaNet()
        ]);
        
        const [vnItems, vnvnItems, yhItems, ivItems, ttItems, tnItems, vnaItems] = results;
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
                console.log(`✅ Saved[${item.source}]: ${item.title.substring(0, 50)}... (img: ${item.imageUrl ? 'yes' : 'no'}, content: ${item.content ? 'yes' : 'no'})`);
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
