import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { translateTitle } from '@/lib/translator';
import { getVietnamTime } from '@/lib/date-utils';

const prisma = new PrismaClient();

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
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const detail = await fetchDetailPage(item.url, ['.fck_detail', '.content_detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'VnExpress',
                category: item.category,
                viewCount: i + 1, // 메인 페이지 순서 (낮을수록 높은 우선순위)
                publishedAt: getVietnamTime(),
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
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const detail = await fetchDetailPage(item.url, ['.fck_detail', 'article.fck_detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'VnExpress VN',
                category: 'Economy',
                viewCount: i + 1, // 메인 페이지 순서
                publishedAt: getVietnamTime(),
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
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
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
                    viewCount: i + 1, // 메인 페이지 순서
                    publishedAt: getVietnamTime(),
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
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
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
                    viewCount: i + 1, // 메인 페이지 순서
                    publishedAt: getVietnamTime(),
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
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const detail = await fetchDetailPage(item.url, ['.detail-content', '#main-detail-body', '.content-detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'TuoiTre',
                category: 'Society',
                viewCount: i + 1, // 메인 페이지 순서
                publishedAt: getVietnamTime(),
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
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const detail = await fetchDetailPage(item.url, ['.detail-content', '.content-detail', '#main-detail-body', '.detail__cmain-main']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'ThanhNien',
                category: 'Society',
                viewCount: i + 1, // 메인 페이지 순서
                publishedAt: getVietnamTime(),
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

async function crawlPublicSecurity() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling Public Security News (en.cand.com.vn)...');
        
        const { data } = await fetchWithRetry('https://en.cand.com.vn/');
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        $('a[href]').each((i, el) => {
            if (listItems.length >= 10) return;
            
            const title = $(el).text().trim();
            const link = $(el).attr('href');
            
            if (!title || title.length < 20 || title.length > 200) return;
            if (!link || link === '/' || link.startsWith('#')) return;
            
            const isArticle = link.includes('-i') || link.match(/[a-z]-[0-9]+\/?$/);
            const isCategory = link.match(/^\/(politics|public-security-forces|culture-travel|economy)\/?$/);
            if (isCategory || !isArticle) return;
            
            const fullUrl = link.startsWith('http') ? link : `https://en.cand.com.vn${link}`;
            
            if (seen.has(fullUrl)) return;
            seen.add(fullUrl);
            
            let category = 'Policy';
            if (link.includes('/public-security')) category = 'Society';
            if (link.includes('/culture')) category = 'Culture';
            if (link.includes('/economy')) category = 'Economy';
            
            listItems.push({ title, url: fullUrl, category });
        });

        console.log(`Public Security list items found: ${listItems.length}`);
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const detail = await fetchDetailPage(item.url, ['.entry-content', '.post-content', '.article-content', '.detail-content']);
            
            const summary = detail.content ? 
                cheerio.load(detail.content).text().trim().substring(0, 300) : 
                item.title;
            
            items.push({
                title: item.title,
                summary: summary,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'PublicSecurity',
                category: item.category,
                viewCount: i + 1, // 메인 페이지 순서
                publishedAt: getVietnamTime(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`Public Security: ${items.length} items`);
    } catch (e) {
        console.error('Public Security crawl error:', e.message);
    }
    return items;
}

async function crawlSaigoneer() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling Saigoneer (Food/Pet/Travel)...');
        
        const { data } = await fetchWithRetry('https://saigoneer.com/');
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        $('a').each((i, el) => {
            if (listItems.length >= 10) return;
            
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            
            if (!title || title.length < 30 || title.length > 200) return;
            if (!href.includes('saigoneer.com/')) return;
            if (href.includes('/tag/') || href.includes('/author/') || href.includes('/listings/') || href.includes('/chapters/')) return;
            
            const isArticle = href.match(/\/\d+-[a-z]/i);
            if (!isArticle) return;
            
            if (seen.has(href)) return;
            seen.add(href);
            
            listItems.push({ title, url: href, category: 'Culture' });
        });

        console.log(`Saigoneer list items found: ${listItems.length}`);
        
        for (const item of listItems) {
            const detail = await fetchDetailPage(item.url, ['.item-page', '.itemFullText', '.article-content']);
            
            const summary = detail.content ? 
                cheerio.load(detail.content).text().trim().substring(0, 300) : 
                item.title;
            
            items.push({
                title: item.title,
                summary: summary,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'Saigoneer',
                category: item.category,
                publishedAt: getVietnamTime(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`Saigoneer: ${items.length} items`);
    } catch (e) {
        console.error('Saigoneer crawl error:', e.message);
    }
    return items;
}

async function crawlSoraNews24() {
    const cheerio = await import('cheerio');
    const Parser = (await import('rss-parser')).default;
    const items = [];
    
    try {
        console.log('📡 Crawling SoraNews24 via RSS (펫/여행만)...');
        
        const parser = new Parser({
            customFields: {
                item: [
                    ['content:encoded', 'contentEncoded'],
                    ['media:content', 'mediaContent'],
                    ['media:thumbnail', 'mediaThumbnail'],
                ]
            }
        });

        // RSS 피드 URL (WordPress 기본 형식)
        const rssFeeds = [
            { 
                url: 'https://soranews24.com/category/animals/feed/', 
                category: 'Culture', 
                name: 'Animals/Pets' 
            },
            { 
                url: 'https://soranews24.com/category/travel/feed/', 
                category: 'Culture', 
                name: 'Travel' 
            },
            // 전체 피드도 시도 (카테고리별이 안 되면)
            { 
                url: 'https://soranews24.com/feed/', 
                category: 'Culture', 
                name: 'All' 
            },
        ];

        const seen = new Set();

        // RSS 피드에서 기사 수집
        for (const feed of rssFeeds) {
            try {
                console.log(`  📡 Fetching RSS feed: ${feed.name} (${feed.url})`);
                
                const feedData = await parser.parseURL(feed.url);
                
                if (!feedData || !feedData.items || feedData.items.length === 0) {
                    console.warn(`    ⚠️ No items found in RSS feed: ${feed.url}`);
                    continue;
                }
                
                console.log(`    ✅ Found ${feedData.items.length} items in RSS feed`);
                
                // 카테고리 필터링 (전체 피드인 경우)
                const filteredItems = feed.url.includes('/feed/') && !feed.url.includes('/category/')
                    ? feedData.items.filter(item => {
                        const url = item.link || '';
                        return url.includes('/category/animals/') || url.includes('/category/travel/');
                    })
                    : feedData.items;
                
                for (const item of filteredItems) {
                    if (items.length >= 30) break; // 최대 30개로 제한
                    
                    const url = item.link || item.guid || '';
                    if (!url || seen.has(url)) continue;
                    
                    // URL 유효성 확인
                    if (!url.includes('soranews24.com')) continue;
                    
                    // 제목 필터링
                    const title = (item.title || '').trim();
                    if (!title || title.length < 10 || title.length > 200) continue;
                    
                    seen.add(url);
                    
                    // 발행 날짜 파싱
                    let publishedAt = getVietnamTime();
                    if (item.pubDate) {
                        try {
                            publishedAt = new Date(item.pubDate);
                            // 베트남 시간대 기준으로 변환
                            publishedAt = new Date(
                                publishedAt.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
                            );
                        } catch (e) {
                            console.warn(`    ⚠️ Failed to parse date for ${url}: ${e.message}`);
                        }
                    }
                    
                    // 이미지 URL 추출
                    let imageUrl = '';
                    if (item.contentEncoded) {
                        const $content = cheerio.load(item.contentEncoded);
                        const firstImg = $content('img').first().attr('src');
                        if (firstImg) imageUrl = firstImg;
                    }
                    if (!imageUrl && item.content) {
                        const imgMatch = item.content.match(/<img[^>]+src="([^"]+)"/i);
                        if (imgMatch) imageUrl = imgMatch[1];
                    }
                    if (!imageUrl && item.mediaThumbnail) {
                        imageUrl = item.mediaThumbnail.$.url || item.mediaThumbnail;
                    }
                    if (!imageUrl && item.mediaContent) {
                        imageUrl = item.mediaContent.$.url || item.mediaContent;
                    }
                    
                    // 요약 추출
                    let summary = '';
                    if (item.contentSnippet) {
                        summary = item.contentSnippet.substring(0, 300);
                    } else if (item.content) {
                        const $content = cheerio.load(item.content);
                        summary = $content.text().substring(0, 300);
                    } else if (item.description) {
                        const $desc = cheerio.load(item.description);
                        summary = $desc.text().substring(0, 300);
                    }
                    
                    // 본문 추출
                    let content = '';
                    if (item.contentEncoded) {
                        content = item.contentEncoded;
                    } else if (item.content) {
                        content = item.content;
                    }
                    
                    items.push({
                        title,
                        summary: summary.trim(),
                        content: content.trim(),
                        originalUrl: url,
                        imageUrl: imageUrl.trim(),
                        category: feed.category,
                        source: 'SoraNews24',
                        publishedAt: publishedAt,
                        status: 'DRAFT'
                    });
                }
                
                console.log(`    ✅ Added ${filteredItems.length} items from ${feed.name} RSS feed`);
                await new Promise(r => setTimeout(r, 500)); // 피드 간 딜레이
                
            } catch (e) {
                console.error(`    ❌ RSS feed error (${feed.name}):`, e.message);
                continue;
            }
        }
        
        // 본문이 없는 경우에만 상세 페이지 크롤링
        for (const item of items) {
            if (!item.content || item.content.length < 100) {
                try {
                    console.log(`  📄 Fetching full content for: ${item.title.substring(0, 50)}...`);
                    const detail = await fetchDetailPage(item.originalUrl, ['.entry-content', '.post-content', '.article-body', 'article']);
                    
                    if (detail.content) {
                        item.content = detail.content;
                        const $content = cheerio.load(detail.content);
                        if (!item.summary || item.summary.length < 50) {
                            item.summary = $content.text().substring(0, 300);
                        }
                    }
                    
                    if (!item.imageUrl && detail.imageUrl) {
                        item.imageUrl = detail.imageUrl;
                    }
                    
                    await new Promise(r => setTimeout(r, 500));
                } catch (err) {
                    console.warn(`  ⚠️ Failed to fetch details for ${item.originalUrl}: ${err.message}`);
                }
            }
        }
        
        console.log(`✅ SoraNews24: ${items.length} items processed (RSS)`);
    } catch (e) {
        console.error('❌ SoraNews24 RSS crawl error:', e.message);
    }
    return items;
}

async function crawlVnExpressTravel() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling VnExpress Travel...');
        const { data } = await fetchWithRetry('https://vnexpress.net/du-lich');
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        // 다양한 선택자로 뉴스 아이템 찾기
        $('.item-news, .item-topstory, article.item-news, h3 a, h2 a').each((index, el) => {
            if (listItems.length >= 10) return;
            
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
            }
        });
        
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
                viewCount: i + 1, // 메인 페이지 순서
                publishedAt: getVietnamTime(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`VnExpress Travel: ${items.length} items`);
    } catch (e) {
        console.error('VnExpress Travel crawl error:', e.message);
    }
    return items;
}

async function crawlVnExpressHealth() {
    const cheerio = await import('cheerio');
    const items = [];
    try {
        console.log('Crawling VnExpress Health...');
        const { data } = await fetchWithRetry('https://vnexpress.net/suc-khoe');
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        // 다양한 선택자로 뉴스 아이템 찾기
        $('.item-news, .item-topstory, article.item-news, h3 a, h2 a').each((index, el) => {
            if (listItems.length >= 10) return;
            
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
            }
        });
        
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
                viewCount: i + 1, // 메인 페이지 순서
                publishedAt: getVietnamTime(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`VnExpress Health: ${items.length} items`);
    } catch (e) {
        console.error('VnExpress Health crawl error:', e.message);
    }
    return items;
}

async function crawlPetNews() {
    // PetNews 크롤러는 별도 파일에서 import (CommonJS 모듈)
    try {
        // Next.js에서 CommonJS 모듈을 동적으로 import
        const petNewsModule = await import('@/scripts/crawlers/petnews');
        // CommonJS default export 처리
        const crawlFn = petNewsModule.default || petNewsModule;
        return await crawlFn();
    } catch (error) {
        console.error('PetNews crawl error:', error.message);
        return [];
    }
}

export async function POST(request) {
    try {
        console.log('🚀 Starting News Crawl (12 Sources with Detail Pages)...');
        
        const results = await Promise.all([
            crawlVnExpress(),
            crawlVnExpressVN(),
            crawlYonhap(),
            crawlInsideVina(),
            crawlTuoitre(),
            crawlThanhNien(),
            crawlPublicSecurity(),
            crawlSaigoneer(),
            crawlSoraNews24(),
            crawlPetNews(),
            crawlVnExpressTravel(),
            crawlVnExpressHealth()
        ]);
        
        const [vnItems, vnvnItems, yhItems, ivItems, ttItems, tnItems, psItems, sgItems, jtItems, petItems, travelItems, healthItems] = results;
        const allItems = [...vnItems, ...vnvnItems, ...yhItems, ...ivItems, ...ttItems, ...tnItems, ...psItems, ...sgItems, ...jtItems, ...petItems, ...travelItems, ...healthItems];
        
        console.log(`Total items found: ${allItems.length}`);
        
        let savedCount = 0;
        const sources = {
            'VnExpress': vnItems.length,
            'VnExpress VN': vnvnItems.length,
            'Yonhap News': yhItems.length,
            'InsideVina': ivItems.length,
            'TuoiTre': ttItems.length,
            'ThanhNien': tnItems.length,
            'PublicSecurity': psItems.length,
            'Saigoneer': sgItems.length,
            'SoraNews24': jtItems.length,
            'PetNews': petItems.length,
            'VnExpress Travel': travelItems.length,
            'VnExpress Health': healthItems.length
        };
        
        // 1. 중복 필터링
        const newItems = [];
        for (const item of allItems) {
            const exists = await prisma.newsItem.findFirst({
                where: { originalUrl: item.originalUrl }
            });
            if (!exists) {
                newItems.push(item);
            }
        }
        
        // 2. 조회수 기준 정렬 (saigoneer, sora 24, thedodo 제외)
        // viewCount가 낮을수록 높은 우선순위 (메인 페이지 상단에 표시된 순서)
        const excludedSources = ['Saigoneer', 'SoraNews24', 'PetNews'];
        newItems.sort((a, b) => {
            const aExcluded = excludedSources.includes(a.source);
            const bExcluded = excludedSources.includes(b.source);
            
            // 제외된 소스는 뒤로
            if (aExcluded && !bExcluded) return 1;
            if (!aExcluded && bExcluded) return -1;
            
            // 둘 다 제외된 경우: 기존 순서 유지
            if (aExcluded && bExcluded) return 0;
            
            // 둘 다 포함된 경우: viewCount 기준 정렬
            const aViewCount = a.viewCount || 999999;
            const bViewCount = b.viewCount || 999999;
            return aViewCount - bViewCount;
        });
        
        console.log(`New items to translate: ${newItems.length} (sorted by view count)`);
        
        // 3. 병렬 번역 (10개씩 배치 - 제목만이라 빠름)
        const batchSize = 10;
        const translatedItems = [];
        
        for (let i = 0; i < newItems.length; i += batchSize) {
            const batch = newItems.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(async (item) => {
                    const processed = await translateTitle(item);
                    return { item, processed };
                })
            );
            translatedItems.push(...results);
            console.log(`번역 완료: ${Math.min(i + batchSize, newItems.length)}/${newItems.length}`);
        }
        
        // 4. 저장
        for (const { item, processed } of translatedItems) {
            await prisma.newsItem.create({ 
              data: {
                ...item,
                translatedTitle: processed.translatedTitle || null,
                category: processed.category
              }
            });
            savedCount++;
            console.log(`✅ [${item.source}]: ${(processed.translatedTitle || item.title).substring(0, 50)}...`);
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
