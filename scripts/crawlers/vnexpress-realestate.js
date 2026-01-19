const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnExpressRealEstate() {
    console.log('Starting crawl of VnExpress Bat Dong San (Real Estate)...');
    try {
        console.log('[VnExpress Real Estate] Fetching RSS feed...');
        // RSS 피드로 아이템 리스트 가져오기 (페이지가 동적 로딩이라 RSS 사용)
        const { data: rssData } = await axios.get('https://vnexpress.net/rss/bat-dong-san.rss', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        console.log('[VnExpress Real Estate] Parsing RSS items...');
        
        const $rss = cheerio.load(rssData, { xmlMode: true });
        const listItems = [];

        // RSS 피드에서 아이템 추출 (리스트만 가져옴, 상세는 나중에)
        $rss('item').each((index, element) => {
            if (index >= 20) return false; // 최대 20개

            const title = $rss(element).find('title').text().trim();
            const link = $rss(element).find('link').text().trim();
            const description = $rss(element).find('description').text().trim();
            
            // description에서 HTML 태그 제거하여 요약으로 사용
            const $desc = cheerio.load(description);
            const summary = $desc.text().trim();

            if (title && link) {
                listItems.push({
                    title,
                    summary: summary.substring(0, 500), // 요약은 500자로 제한
                    originalUrl: link,
                    imageUrl: '', // 상세 페이지에서 가져올 예정
                    category: 'Real Estate', // 부동산 카테고리
                    source: 'VnExpress Real Estate',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });

        console.log(`[VnExpress Real Estate] Found ${listItems.length} RSS items`);
        
        // 병렬 처리로 최적화 (10개씩 배치 처리)
        const detailedItems = [];
        const BATCH_SIZE = 10; // 동시에 10개씩 처리 (속도 향상)
        
        const fetchDetail = async (item) => {
            try {
                console.log(`[VnExpress Real Estate] Fetching: ${item.title.substring(0, 40)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                let content = $detail('.fck_detail, .sidebar-1, .content-detail, article.fck_detail, .container .sidebar-1').html();

                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                } else {
                    const firstImg = $detail('.fck_detail img, article img').first().attr('src');
                    if (firstImg) {
                        item.imageUrl = firstImg.startsWith('http') ? firstImg : `https://vnexpress.net${firstImg}`;
                    }
                }

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`[VnExpress Real Estate] No content for ${item.originalUrl}`);
                    item.content = item.summary || item.title;
                }
                
                return item;
            } catch (err) {
                console.error(`[VnExpress Real Estate] Failed: ${item.title.substring(0, 30)}...`, err.message);
                item.content = item.summary || item.title;
                return item;
            }
        };
        
        for (let i = 0; i < listItems.length; i += BATCH_SIZE) {
            const batch = listItems.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(listItems.length / BATCH_SIZE);
            
            console.log(`[VnExpress Real Estate] Batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
            
            // 병렬 실행 (Promise.allSettled: 일부 실패해도 나머지 계속)
            const results = await Promise.allSettled(batch.map(item => fetchDetail(item)));
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    detailedItems.push(result.value);
                }
            });
            
            // 배치 간 딜레이 제거 (속도 향상)
        }

        console.log(`[VnExpress Real Estate] Successfully crawled ${detailedItems.length} items`);
        return detailedItems;
    } catch (error) {
        console.error('[VnExpress Real Estate] Crawl failed:', error.message);
        console.error('[VnExpress Real Estate] Error stack:', error.stack);
        // 에러가 발생해도 빈 배열 리턴하여 다른 크롤러는 계속 진행
        return [];
    }
}

module.exports = crawlVnExpressRealEstate;
