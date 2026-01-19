const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnExpressEconomy() {
    console.log('Starting crawl of VnExpress Kinh Te (Economy)...');
    try {
        console.log('[VnExpress Economy] Fetching RSS feed...');
        // RSS 피드로 아이템 리스트 가져오기 (페이지가 동적 로딩이라 RSS 사용)
        const { data: rssData } = await axios.get('https://vnexpress.net/rss/kinh-te.rss', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        console.log('[VnExpress Economy] Parsing RSS items...');
        
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
                    category: 'Economy', // 경제 뉴스로 고정
                    source: 'VnExpress Economy',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });

        console.log(`[VnExpress Economy] Found ${listItems.length} RSS items`);
        
        // 병렬 처리로 최적화 (5개씩 배치 처리)
        const detailedItems = [];
        const BATCH_SIZE = 5; // 동시에 5개씩 처리
        
        // 상세 페이지 가져오기 함수
        const fetchDetail = async (item) => {
            try {
                console.log(`[VnExpress Economy] Fetching: ${item.title.substring(0, 40)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                // VnExpress 본문 선택자
                let content = $detail('.fck_detail, .sidebar-1, .content-detail, article.fck_detail, .container .sidebar-1').html();

                // 이미지 추출
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
                    console.warn(`[VnExpress Economy] No content for ${item.originalUrl}`);
                    item.content = item.summary || item.title;
                }
                
                return item;
            } catch (err) {
                console.error(`[VnExpress Economy] Failed: ${item.title.substring(0, 30)}...`, err.message);
                item.content = item.summary || item.title;
                return item;
            }
        };
        
        // 배치 처리 (5개씩 병렬 실행)
        for (let i = 0; i < listItems.length; i += BATCH_SIZE) {
            const batch = listItems.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(listItems.length / BATCH_SIZE);
            
            console.log(`[VnExpress Economy] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
            
            // 병렬 실행
            const results = await Promise.all(batch.map(item => fetchDetail(item)));
            detailedItems.push(...results);
            
            // 배치 간 짧은 대기 (서버 부하 방지)
            if (i + BATCH_SIZE < listItems.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        console.log(`[VnExpress Economy] Successfully crawled ${detailedItems.length} items`);
        return detailedItems;
    } catch (error) {
        console.error('[VnExpress Economy] Crawl failed:', error.message);
        console.error('[VnExpress Economy] Error stack:', error.stack);
        // 에러가 발생해도 빈 배열 리턴하여 다른 크롤러는 계속 진행
        return [];
    }
}

module.exports = crawlVnExpressEconomy;

