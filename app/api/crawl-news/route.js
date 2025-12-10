import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import OpenAI from 'openai';

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
            if (index >= 10) return;
            
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
            if (index >= 10) return;
            
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
    const axios = (await import('axios')).default;
    const items = [];
    try {
        console.log('Crawling Yonhap News...');
        const { data } = await axios.get('https://www.yna.co.kr/international/asia-australia', {
            timeout: 15000,
            headers: { 
                'User-Agent': USER_AGENT,
                'Referer': 'https://www.yna.co.kr/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9'
            }
        });
        const $ = cheerio.load(data);
        
        const listItems = [];
        
        $('.list-type038 li, .list-type212 li, .news-list li').each((i, el) => {
            if (listItems.length >= 10) return;
            
            const titleEl = $(el).find('.tit-news a, .news-tl a, .tit a, a.tit-news').first();
            let title = titleEl.text().trim();
            let link = titleEl.attr('href');
            
            if (!title) {
                title = $(el).find('.tit-news, .news-tl').first().text().trim();
                link = $(el).find('a').first().attr('href');
            }
            
            const summary = $(el).find('.lead, .news-con').text().trim();
            
            if (title && link) {
                if (!link.startsWith('http')) {
                    link = `https://www.yna.co.kr${link}`;
                }
                listItems.push({ title, summary, url: link });
            }
        });

        console.log(`Yonhap list items found: ${listItems.length}`);
        
        for (const item of listItems) {
            try {
                const { data: detailData } = await axios.get(item.url, {
                    timeout: 15000,
                    headers: { 
                        'User-Agent': USER_AGENT,
                        'Referer': 'https://www.yna.co.kr/international/asia-australia'
                    }
                });
                const $d = cheerio.load(detailData);
                const content = $d('.article-txt').html() || $d('.story-news').html() || $d('.article').html();
                const imageUrl = $d('meta[property="og:image"]').attr('content');
                
                items.push({
                    title: item.title,
                    summary: item.summary || item.title,
                    content: content?.trim() || null,
                    originalUrl: item.url,
                    imageUrl: imageUrl || null,
                    source: 'Yonhap News',
                    category: 'Korea-Vietnam',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`Yonhap detail failed: ${e.message}`);
            }
        }
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
        const { data } = await axios.get('https://www.insidevina.com/', {
            timeout: 15000,
            headers: { 
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        $('a[href*="articleView.html"]').each((i, el) => {
            if (listItems.length >= 10) return;
            
            const link = $(el).attr('href');
            const titleEl = $(el).find('.auto-titles, .altlist-subject').first();
            let title = titleEl.text().trim();
            
            if (!title) {
                title = $(el).text().trim();
            }
            
            if (title && link && title.length > 10 && !seen.has(link)) {
                seen.add(link);
                const fullUrl = link.startsWith('http') ? link : `https://www.insidevina.com${link}`;
                listItems.push({ title, url: fullUrl });
            }
        });

        console.log(`InsideVina list items found: ${listItems.length}`);
        
        for (const item of listItems) {
            try {
                const { data: detailData } = await axios.get(item.url, {
                    timeout: 15000,
                    headers: { 
                        'User-Agent': USER_AGENT,
                        'Referer': 'https://www.insidevina.com/'
                    }
                });
                const $d = cheerio.load(detailData);
                const content = $d('#article-view-content-div').html() || $d('.article-body').html() || $d('.article-view-body').html();
                const imageUrl = $d('meta[property="og:image"]').attr('content');
                const summary = $d('meta[property="og:description"]').attr('content') || item.title;
                
                items.push({
                    title: item.title,
                    summary: summary,
                    content: content?.trim() || null,
                    originalUrl: item.url,
                    imageUrl: imageUrl || null,
                    source: 'InsideVina',
                    category: 'Korea-Vietnam',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`InsideVina detail failed: ${e.message}`);
            }
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
            if (listItems.length >= 10) return;
            
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
            if (listItems.length >= 10) return;
            
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
    const axios = (await import('axios')).default;
    const items = [];
    try {
        console.log('Crawling VNA (English)...');
        
        const agent = new https.Agent({ 
            rejectUnauthorized: false,
            secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
        });
        
        const { data } = await axios.get('https://vnanet.vn/en/', { 
            timeout: 15000,
            httpsAgent: agent,
            headers: { 
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        $('a[href*=".html"]').each((i, el) => {
            if (listItems.length >= 10) return;
            
            const title = $(el).text().trim();
            const link = $(el).attr('href');
            
            if (!title || title.length < 15) return;
            if (!link || !link.includes('/en/')) return;
            
            const fullUrl = link.startsWith('http') ? link : `https://vnanet.vn${link}`;
            
            if (seen.has(fullUrl)) return;
            seen.add(fullUrl);
            
            const container = $(el).closest('li, div, td');
            const summary = container.find('.news-sapo, .sapo, .summary, p').text().trim();
            
            listItems.push({ title, summary, url: fullUrl });
        });

        console.log(`VNA list items found: ${listItems.length}`);
        
        for (const item of listItems) {
            try {
                const { data: detailData } = await axios.get(item.url, {
                    timeout: 15000,
                    httpsAgent: agent,
                    headers: { 'User-Agent': USER_AGENT }
                });
                const $d = cheerio.load(detailData);
                const content = $d('.news-detail, .detail-content, .content-detail, .fck_detail').html();
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
                const processed = await translateAndProcess(item);
                
                await prisma.newsItem.create({ 
                  data: {
                    ...item,
                    translatedTitle: processed.translatedTitle || null,
                    translatedSummary: processed.translatedSummary || null,
                    category: processed.category
                  }
                });
                savedCount++;
                console.log(`✅ Saved[${item.source}]: ${item.title.substring(0, 50)}...`);
                if (processed.translatedTitle) {
                  console.log(`   → 번역: ${processed.translatedTitle.substring(0, 50)}...`);
                }
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
