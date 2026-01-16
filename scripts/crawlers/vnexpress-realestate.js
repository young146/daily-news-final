const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnExpressRealEstate() {
    console.log('Starting crawl of VnExpress Bat Dong San (Real Estate)...');
    try {
        // RSS 피드로 아이템 리스트 가져오기 (페이지가 동적 로딩이라 RSS 사용)
        const { data: rssData } = await axios.get('https://vnexpress.net/rss/bat-dong-san.rss', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
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

        // 기존 VnExpress VN 크롤러와 동일한 방식으로 상세 페이지 방문
        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                // VnExpress 본문 선택자 (기존 VnExpress VN과 동일)
                let content = $detail('.fck_detail, .sidebar-1, .content-detail, article.fck_detail, .container .sidebar-1').html();

                // 이미지 추출 (기존 VnExpress VN과 동일한 방식)
                // 1. og:image 메타 태그 우선 (고해상도 이미지)
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                } else {
                    // 2. 본문의 첫 번째 이미지
                    const firstImg = $detail('.fck_detail img, article img').first().attr('src');
                    if (firstImg) {
                        item.imageUrl = firstImg.startsWith('http') ? firstImg : `https://vnexpress.net${firstImg}`;
                    }
                }

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary || item.title;
                }

                detailedItems.push(item);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 서버 부하 방지

            } catch (err) {
                console.error(`Failed to fetch details for ${item.originalUrl}:`, err.message);
                item.content = item.summary || item.title;
                detailedItems.push(item);
            }
        }

        console.log(`VnExpress Real Estate: ${detailedItems.length} items collected`);
        return detailedItems;
    } catch (error) {
        console.error('VnExpress Real Estate crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlVnExpressRealEstate;
