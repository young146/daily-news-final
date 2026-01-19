const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnExpressHealth() {
    console.log('[VnExpress Health] Starting crawl...');
    try {
        console.log('[VnExpress Health] Fetching main page...');
        const { data } = await axios.get('https://vnexpress.net/suc-khoe', {
            timeout: 20000, // 5초로 단축 (Vercel 타임아웃 방지)
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];
        
        console.log('[VnExpress Health] Parsing list items...');

        // 다양한 선택자로 뉴스 아이템 찾기
        $('.item-news, .item-topstory, article.item-news, .title-news').each((index, element) => {
            if (listItems.length >= 5) return false; // 최대 5개 (타임아웃 방지)

            const titleElement = $(element).find('a').first();
            const title = titleElement.text().trim();
            let url = titleElement.attr('href');
            const summary = $(element).find('.description, .lead_news_site a, p').first().text().trim();
            const imageElement = $(element).find('img').first();
            let imageUrl = imageElement.attr('src') || imageElement.attr('data-src') || imageElement.attr('data-original');

            if (title && url && title.length > 10) {
                // URL 정규화
                if (!url.startsWith('http')) {
                    if (url.startsWith('//')) {
                        url = 'https:' + url;
                    } else if (url.startsWith('/')) {
                        url = 'https://vnexpress.net' + url;
                    } else {
                        url = 'https://vnexpress.net/' + url;
                    }
                }

                // 중복 체크
                const isDuplicate = listItems.some(item => item.originalUrl === url);
                if (!isDuplicate) {
                    listItems.push({
                        title,
                        summary,
                        originalUrl: url,
                        imageUrl: imageUrl,
                        category: 'Health',
                        source: 'VnExpress Health',
                        publishedAt: new Date(),
                        status: 'DRAFT'
                    });
                }
            }
        });
        
        console.log(`[VnExpress Health] Found ${listItems.length} list items`);

        // 병렬 처리로 상세 페이지 수집
        const detailedItems = [];
        const BATCH_SIZE = 5; // 동시에 5개씩 처리 (타임아웃 방지)

        const fetchDetail = async (item) => {
            try {
                console.log(`[VnExpress Health] Fetching: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 20000, // 5초로 단축
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                // VnExpress 컨텐츠 선택자
                let content = $detail('.fck_detail').html() || 
                             $detail('article.fck_detail').html() || 
                             $detail('.content_detail').html();

                if (!content || content.length < 100) {
                    content = item.summary || item.title;
                }

                // 이미지 URL 보완
                if (!item.imageUrl) {
                    item.imageUrl = $detail('meta[property="og:image"]').attr('content') ||
                                   $detail('.fig-picture img').attr('src') ||
                                   $detail('article img').first().attr('src');
                }

                item.content = content;
                return item;
            } catch (err) {
                console.error(`[VnExpress Health] Failed: ${item.title.substring(0, 30)}...`, err.message);
                item.content = item.summary || item.title;
                return item;
            }
        };

        for (let i = 0; i < listItems.length; i += BATCH_SIZE) {
            const batch = listItems.slice(i, i + BATCH_SIZE);
            console.log(`[VnExpress Health] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)...`);
            
            const results = await Promise.allSettled(batch.map(item => fetchDetail(item)));
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    detailedItems.push(result.value);
                }
            });
        }

        console.log(`[VnExpress Health] Successfully collected ${detailedItems.length} items`);
        return detailedItems;

    } catch (error) {
        console.error('[VnExpress Health] Crawl error:', error.message);
        return [];
    }
}

module.exports = crawlVnExpressHealth;
