const axios = require('axios');
const cheerio = require('cheerio');

const SEARCH_URL = 'https://www.yna.co.kr/search/index?query=%EB%B2%A0%ED%8A%B8%EB%82%A8'; // "베트남"
const MAX_ITEMS = 10;
const MIN_TITLE_LEN = 10; // 섹션명(세계/전국 등)은 2~4자라 10자로 컷
const REQUEST_TIMEOUT = 20000;
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// 연합뉴스 기사 URL 패턴: /view/AKR..., /view/AEN..., /view/PYH... 등
// 섹션 페이지는 /economy, /international 등으로 /view/A* 가 없음
const ARTICLE_URL_PATTERN = /\/view\/A[A-Z]{2}\d/;

// 알려진 섹션/네비 텍스트 (정확 일치 차단)
const SECTION_NAMES = new Set([
    '세계', '전국', '사회', '산업', '마켓', '경제', '정치', '문화', '스포츠',
    '연예', 'IT', '국제', '기업', '금융', '부동산', 'TV', '라이프', '오피니언',
    '지역', '특집', '인사이트', '미국', '아시아', '중국', '일본', '북한',
    '뉴스', '홈', '메인', 'HOME', '검색'
]);

// 검색 결과 페이지에서 list 항목 추출 (가장 많이 매칭되는 셀렉터 선택)
function extractListItems($) {
    const SELECTORS = [
        '.list-type212 li',
        '.list01 li',
        '.search-result-list li',
        'ul.list li.item',
        '.cts_atclst li',
    ];

    let best = null;
    let bestCount = 0;
    for (const selector of SELECTORS) {
        const found = $(selector);
        if (found.length > bestCount) {
            best = { sel: selector, els: found };
            bestCount = found.length;
        }
    }
    if (best) {
        console.log(`[YonhapVN] Using list selector: ${best.sel} (${bestCount} items)`);
        return best.els;
    }
    console.warn('[YonhapVN] No list items found with known selectors');
    return $();
}

// 기사 후보 셀렉터에서만 제목/링크 추출 ('a' 같은 광역 fallback 제거)
function extractTitleAndLink($el) {
    const candidates = [
        $el.find('.tit-news').first(),
        $el.find('.title01').first(),
        $el.find('strong.tit').first(),
        $el.find('h3 a').first(),
        $el.find('a.tit-wrap').first(),
        $el.find('a.tit').first(),
    ];

    for (const c of candidates) {
        if (c.length === 0) continue;
        const title = c.text().trim();
        let link = c.attr('href') || c.find('a').first().attr('href');
        if (!title || !link) continue;
        if (link.startsWith('//')) link = 'https:' + link;
        else if (link.startsWith('/')) link = 'https://www.yna.co.kr' + link;
        return { title, link };
    }
    return { title: null, link: null };
}

function isLikelyArticle(title, link) {
    if (!title || !link) return false;
    if (title.length < MIN_TITLE_LEN) return false;
    if (SECTION_NAMES.has(title)) return false;
    if (!ARTICLE_URL_PATTERN.test(link)) return false;
    return true;
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
        let rejected = 0;

        listEls.each((i, el) => {
            if (listItems.length >= MAX_ITEMS) return false;

            const $el = $(el);
            const { title, link } = extractTitleAndLink($el);
            if (!isLikelyArticle(title, link)) {
                if (title || link) rejected++;
                return;
            }

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

        console.log(`[YonhapVN] Accepted ${listItems.length} articles, rejected ${rejected} non-article candidates`);

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
