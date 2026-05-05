const axios = require('axios');
const cheerio = require('cheerio');

const HOMEPAGE_URL = 'https://www.yna.co.kr/';
const RSS_URL = 'https://www.yna.co.kr/rss/news.xml';
const MAX_ITEMS = 10;
const REQUEST_TIMEOUT = 20000;
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// 1차 시도: RSS 피드 (안정적)
async function fetchFromRSS() {
    try {
        console.log('[YonhapMain] Trying RSS feed...');
        const { data } = await axios.get(RSS_URL, { timeout: REQUEST_TIMEOUT, headers: HEADERS });
        const $ = cheerio.load(data, { xmlMode: true });

        const items = [];
        $('item').each((i, el) => {
            if (items.length >= MAX_ITEMS) return false;
            const $el = $(el);
            const title = $el.find('title').first().text().trim();
            const link = $el.find('link').first().text().trim();
            const description = $el.find('description').first().text().trim();
            const pubDate = $el.find('pubDate').first().text().trim();

            if (title && link) {
                items.push({
                    title,
                    summary: description.replace(/<[^>]+>/g, '').trim(),
                    originalUrl: link,
                    imageUrl: null,
                    category: 'Korea-Hot',
                    source: 'Yonhap Main',
                    publishedAt: pubDate ? new Date(pubDate) : new Date(),
                    status: 'DRAFT'
                });
            }
        });

        console.log(`[YonhapMain] RSS yielded ${items.length} items`);
        return items;
    } catch (err) {
        console.warn(`[YonhapMain] RSS fetch failed: ${err.message}`);
        return [];
    }
}

// 2차 시도: 홈페이지 HTML 스크래핑 (RSS 실패 시)
async function fetchFromHomepage() {
    try {
        console.log('[YonhapMain] Trying homepage HTML...');
        const { data } = await axios.get(HOMEPAGE_URL, { timeout: REQUEST_TIMEOUT, headers: HEADERS });
        const $ = cheerio.load(data);

        const SELECTORS = [
            '.headline-list01 li',
            '.list-type01 li',
            '.major-news li',
            '.lead-news li',
            'ul.list li',
        ];

        let listEls = $();
        for (const sel of SELECTORS) {
            const found = $(sel);
            if (found.length > 3) {
                console.log(`[YonhapMain] Using selector: ${sel} (${found.length} items)`);
                listEls = found;
                break;
            }
        }

        const items = [];
        listEls.each((i, el) => {
            if (items.length >= MAX_ITEMS) return false;
            const $el = $(el);

            const titleEl = $el.find('.tit-news, .title, h3 a, a.tit, a').first();
            const title = titleEl.text().trim();
            let link = titleEl.attr('href') || titleEl.find('a').attr('href');
            if (!title || !link) return;
            if (link.startsWith('//')) link = 'https:' + link;
            else if (link.startsWith('/')) link = 'https://www.yna.co.kr' + link;
            // 외부 링크 / 광고 필터링
            if (!link.includes('yna.co.kr')) return;

            const summary = $el.find('.lead, .summary, p').first().text().trim();
            const imgEl = $el.find('img').first();
            let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
            if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

            items.push({
                title,
                summary,
                originalUrl: link,
                imageUrl,
                category: 'Korea-Hot',
                source: 'Yonhap Main',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
        });

        console.log(`[YonhapMain] Homepage yielded ${items.length} items`);
        return items;
    } catch (err) {
        console.warn(`[YonhapMain] Homepage fetch failed: ${err.message}`);
        return [];
    }
}

async function fetchDetail(item) {
    try {
        const { data } = await axios.get(item.originalUrl, { timeout: REQUEST_TIMEOUT, headers: HEADERS });
        const $ = cheerio.load(data);

        let content = $('.article-txt').html()
            || $('.story-news').html()
            || $('article').html()
            || $('.content-area').html();

        const metaImage = $('meta[property="og:image"]').attr('content');
        if (metaImage) item.imageUrl = metaImage;

        item.content = content ? content.trim() : item.summary;
        return item;
    } catch (err) {
        console.warn(`[YonhapMain] Detail fetch failed for ${item.originalUrl}: ${err.message}`);
        item.content = item.summary;
        return item;
    }
}

async function crawlYonhapMain() {
    console.log('[YonhapMain] Starting crawl of Yonhap main headlines...');
    try {
        // RSS 우선, 실패 시 홈페이지
        let items = await fetchFromRSS();
        if (items.length === 0) {
            items = await fetchFromHomepage();
        }

        if (items.length === 0) {
            console.warn('[YonhapMain] No items from any source');
            return [];
        }

        // URL 중복 제거
        const seen = new Set();
        items = items.filter(it => {
            if (seen.has(it.originalUrl)) return false;
            seen.add(it.originalUrl);
            return true;
        });

        // 상세 본문 가져오기 (순차, rate-limit 보호)
        const detailed = [];
        for (const item of items) {
            console.log(`[YonhapMain] Fetching detail: ${item.title.substring(0, 40)}...`);
            const result = await fetchDetail(item);
            detailed.push(result);
            await new Promise(r => setTimeout(r, 800));
        }

        return detailed;
    } catch (error) {
        console.error('[YonhapMain] Crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlYonhapMain;
