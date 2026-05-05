const axios = require('axios');
const cheerio = require('cheerio');

const SEARCH_URL = 'https://www.yna.co.kr/search/index?query=%EB%B2%A0%ED%8A%B8%EB%82%A8'; // "베트남"
const MAX_ITEMS = 10;
const REQUEST_TIMEOUT = 20000;
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// 검색 결과 페이지에서 list 항목 추출 (셀렉터 fallback 체인)
function extractListItems($) {
    const SELECTORS = [
        '.list-type212 li',
        '.list01 li',
        '.search-result-list li',
        'ul.list li.item',
    ];

    for (const selector of SELECTORS) {
        const found = $(selector);
        if (found.length > 0) {
            console.log(`[YonhapVN] Using list selector: ${selector} (${found.length} items)`);
            return found;
        }
    }
    console.warn('[YonhapVN] No list items found with known selectors');
    return $();
}

function extractTitleAndLink($el, $) {
    // 우선순위 셀렉터들
    const candidates = [
        $el.find('.tit-news').first(),
        $el.find('.title01 a').first(),
        $el.find('h3 a').first(),
        $el.find('a.tit').first(),
        $el.find('a').first(),
    ];

    for (const c of candidates) {
        if (c.length > 0) {
            const title = c.text().trim();
            let link = c.attr('href') || c.find('a').attr('href');
            if (title && link) {
                if (link.startsWith('//')) link = 'https:' + link;
                else if (link.startsWith('/')) link = 'https://www.yna.co.kr' + link;
                return { title, link };
            }
        }
    }
    return { title: null, link: null };
}

async function crawlYonhapVietnam() {
    console.log('[YonhapVN] Starting crawl of Yonhap Vietnam search...');
    try {
        const { data } = await axios.get(SEARCH_URL, {
            timeout: REQUEST_TIMEOUT,
            headers: HEADERS
        });
        const $ = cheerio.load(data);

        const listEls = extractListItems($);
        const listItems = [];

        listEls.each((i, el) => {
            if (listItems.length >= MAX_ITEMS) return false;

            const $el = $(el);
            const { title, link } = extractTitleAndLink($el, $);
            if (!title || !link) return;

            const summary = $el.find('.lead, .summary, p').first().text().trim();
            const imgEl = $el.find('img').first();
            let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;
            if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

            listItems.push({
                title,
                summary,
                originalUrl: link,
                imageUrl,
                category: 'Korea-Hot',
                source: 'Yonhap Vietnam',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
        });

        console.log(`[YonhapVN] Found ${listItems.length} list items`);

        // 상세 본문 가져오기
        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`[YonhapVN] Fetching detail: ${item.title.substring(0, 40)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: REQUEST_TIMEOUT,
                    headers: HEADERS
                });
                const $detail = cheerio.load(detailData);

                let content = $detail('.article-txt').html()
                    || $detail('.story-news').html()
                    || $detail('article').html()
                    || $detail('.content-area').html();

                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) item.imageUrl = metaImage;

                item.content = content ? content.trim() : item.summary;
                detailedItems.push(item);
                await new Promise(r => setTimeout(r, 800));
            } catch (err) {
                console.warn(`[YonhapVN] Detail fetch failed for ${item.originalUrl}: ${err.message}`);
                item.content = item.summary;
                detailedItems.push(item);
            }
        }

        return detailedItems;
    } catch (error) {
        console.error('[YonhapVN] Crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlYonhapVietnam;
