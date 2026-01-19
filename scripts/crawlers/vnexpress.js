const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnExpress() {
    console.log('Starting crawl of VnExpress International...');
    try {
        console.log('[VnExpress] Fetching main page...');
        const { data } = await axios.get('https://e.vnexpress.net/', {
            timeout: 10000,
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

        $('.item-news, .item-topstory').each((index, element) => {
            if (index >= 20) return false; // 최대 20개

            const titleElement = $(element).find('.title_news_site a');
            const title = titleElement.text().trim();
            const url = titleElement.attr('href');
            const summary = $(element).find('.lead_news_site a').text().trim();
            const imageElement = $(element).find('img');
            let imageUrl = imageElement.attr('src') || imageElement.attr('data-original');

            if (title && url) {
                let category = 'Society';
                if (url.includes('business')) category = 'Economy';
                if (url.includes('life')) category = 'Culture';

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
        });

        console.log(`[VnExpress] Found ${listItems.length} list items`);
        
        // 병렬 처리로 최적화
        const BATCH_SIZE = 5;
        
        const fetchDetail = async (item) => {
            try {
                console.log(`[VnExpress] Fetching: ${item.title.substring(0, 40)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 10000,
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
            
            const results = await Promise.all(batch.map(item => fetchDetail(item)));
            detailedItems.push(...results);
            
            if (i + BATCH_SIZE < listItems.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
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
