const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnExpress() {
    console.log('Starting crawl of VnExpress International...');
    try {
        console.log('[VnExpress] Fetching main page...');
        const { data } = await axios.get('https://e.vnexpress.net/', {
            timeout: 5000, // 5초로 단축 (Vercel 타임아웃 방지)
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const items = [];

        // Process items to fetch full content
        const detailedItems = [];
        const listItems = [];
        
        console.log('[VnExpress] Parsing list items...');

        // 더 넓은 선택자 사용
        $('.item-news, .item-topstory, article.item-news, .title-news').each((index, element) => {
            if (listItems.length >= 5) return false; // 최대 5개 (타임아웃 방지)

            const titleElement = $(element).find('a').first();
            const title = titleElement.text().trim();
            const url = titleElement.attr('href');
            const summary = $(element).find('.description, .lead_news_site a, p').first().text().trim();
            const imageElement = $(element).find('img').first();
            let imageUrl = imageElement.attr('src') || imageElement.attr('data-src') || imageElement.attr('data-original');

            if (title && url && title.length > 10) {
                let category = 'Society';
                if (url.includes('business')) category = 'Economy';
                if (url.includes('life')) category = 'Culture';

                // 중복 체크
                const isDuplicate = listItems.some(item => item.originalUrl === url);
                if (!isDuplicate) {
                    listItems.push({
                    title,
                    summary,
                    originalUrl: url,
                    imageUrl: imageUrl,
                    category,
                    source: 'VnExpress',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                    });
                }
            }
        });
        
        console.log(`[VnExpress] Found ${listItems.length} list items from selectors`);

        console.log(`[VnExpress] Found ${listItems.length} list items`);
        
        // 병렬 처리로 최적화
        const BATCH_SIZE = 5; // 동시에 5개씩 처리 (타임아웃 방지)
        
        const fetchDetail = async (item) => {
            try {
                console.log(`[VnExpress] Fetching: ${item.title.substring(0, 40)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 5000, // 5초로 단축
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                let content = $detail('.fck_detail').html();

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`[VnExpress] No content for ${item.originalUrl}`);
                    item.content = item.summary || item.title;
                }
                
                return item;
            } catch (err) {
                console.error(`[VnExpress] Failed: ${item.title.substring(0, 30)}...`, err.message);
                item.content = item.summary || item.title;
                return item;
            }
        };
        
        for (let i = 0; i < listItems.length; i += BATCH_SIZE) {
            const batch = listItems.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(listItems.length / BATCH_SIZE);
            
            console.log(`[VnExpress] Batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
            
            // 병렬 실행 (Promise.allSettled: 일부 실패해도 나머지 계속)
            const results = await Promise.allSettled(batch.map(item => fetchDetail(item)));
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    detailedItems.push(result.value);
                }
            });
            
            // 배치 간 딜레이 제거 (속도 향상)
        }

        console.log(`[VnExpress] Successfully crawled ${detailedItems.length} items`);
        return detailedItems;
    } catch (error) {
        console.error('[VnExpress] Crawl failed:', error.message);
        console.error('[VnExpress] Error stack:', error.stack);
        // 에러가 발생해도 빈 배열 리턴하여 다른 크롤러는 계속 진행
        return [];
    }
}

module.exports = crawlVnExpress;
