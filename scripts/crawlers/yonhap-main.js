const axios = require('axios');
const cheerio = require('cheerio');

const HOMEPAGE_URL = 'https://www.yna.co.kr/';
const RSS_URL = 'https://www.yna.co.kr/rss/news.xml';
const MAX_ITEMS = 10;
const MIN_TITLE_LEN = 10;
const REQUEST_TIMEOUT = 20000;
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// 연합뉴스 기사 URL 패턴
const ARTICLE_URL_PATTERN = /\/view\/A[A-Z]{2}\d/;

// 알려진 섹션/네비 텍스트
const SECTION_NAMES = new Set([
    '세계', '전국', '사회', '산업', '마켓', '경제', '정치', '문화', '스포츠',
    '연예', 'IT', '국제', '기업', '금융', '부동산', 'TV', '라이프', '오피니언',
    '지역', '특집', '인사이트', '미국', '아시아', '중국', '일본', '북한',
    '뉴스', '홈', '메인', 'HOME', '검색'
]);

function isLikelyArticle(title, link) {
    if (!title || !link) return false;
    const t = title.trim();
    if (t.length < MIN_TITLE_LEN) return false;
    if (SECTION_NAMES.has(t)) return false;
    if (!ARTICLE_URL_PATTERN.test(link)) return false;
    return true;
}

// 1차 시도: RSS 피드 (안정적, 항상 기사만)
async function fetchFromRSS() {
    try {
        console.log('[YonhapMain] Trying RSS feed...');
        const { data } = await axios.get(RSS_URL, { timeout: REQUEST_TIMEOUT, headers: HEADERS });
        const $ = cheerio.load(data, { xmlMode: true });

        const items = [];
        let rejected = 0;
        $('item').each((i, el) => {
            if (items.length >= MAX_ITEMS) return false;
            const $el = $(el);
            const title = $el.find('title').first().text().trim();
            const link = $el.find('link').first().text().trim();
            const description = $el.find('description').first().text().trim();
            const pubDate = $el.find('pubDate').first().text().trim();

            if (!isLikelyArticle(title, link)) {
                if (title || link) rejected++;
                return;
            }

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
        });

        console.log(`[YonhapMain] RSS accepted ${items.length}, rejected ${rejected}`);
        return items;
    } catch (err) {
        console.warn(`[YonhapMain] RSS fetch failed: ${err.message}`);
        return [];
    }
}

// 2차 시도: 홈페이지 HTML (RSS 0개일 때만)
async function fetchFromHomepage() {
    try {
        console.log('[YonhapMain] Trying homepage HTML...');
        const { data } = await axios.get(HOMEPAGE_URL, { timeout: REQUEST_TIMEOUT, headers: HEADERS });
        const $ = cheerio.load(data);

        // 후보 컨테이너에서 기사 후보 anchor만 추림 — 광역 'a' fallback 제거
        const ARTICLE_SELECTORS = [
            'a.tit-news',
            'a.tit-wrap',
            'a.tit',
            'strong.tit-news a',
            '.headline-list01 a',
            '.list-type01 .tit-news',
            '.major-news .tit',
        ];

        const seen = new Set();
        const items = [];
        let rejected = 0;

        for (const sel of ARTICLE_SELECTORS) {
            $(sel).each((i, el) => {
                if (items.length >= MAX_ITEMS) return false;
                const $a = $(el);
                const title = $a.text().trim();
                let link = $a.attr('href') || $a.find('a').first().attr('href');
                if (!link) return;
                if (link.startsWith('//')) link = 'https:' + link;
                else if (link.startsWith('/')) link = 'https://www.yna.co.kr' + link;

                if (!isLikelyArticle(title, link)) {
                    rejected++;
                    return;
                }
                if (seen.has(link)) return;
                seen.add(link);

                items.push({
                    title,
                    summary: '',
                    originalUrl: link,
                    imageUrl: null,
                    category: 'Korea-Hot',
                    source: 'Yonhap Main',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            });
            if (items.length >= MAX_ITEMS) break;
        }

        console.log(`[YonhapMain] Homepage accepted ${items.length}, rejected ${rejected}`);
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

        // 상세 본문 가져오기
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
