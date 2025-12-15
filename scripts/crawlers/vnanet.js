/**
 * Placeholder crawler for VNA Net.
 * Currently returns an empty list to keep build passing on Vercel.
 * Replace with real implementation when ready.
 */
module.exports = async function crawlVnaNet() {
    return [];
};
const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnaNet() {
    console.log('Starting crawl of VNA Net...');
    try {
        // VNA Net 크롤링 로직
        // 현재는 기본 구조만 제공 (필요시 구현)
        const { data } = await axios.get('https://vnanet.vn/en/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });
        const $ = cheerio.load(data);
        const listItems = [];

        // VNA Net 셀렉터 (문서에 따르면 a[href*=".html"] 사용)
        $('a[href*=".html"]').each((index, element) => {
            if (index > 9) return;

            const title = $(element).text().trim();
            const url = $(element).attr('href');

            if (title && url && title.length > 10) {
                const fullUrl = url.startsWith('http') ? url : `https://vnanet.vn${url}`;
                
                // 중복 체크
                if (listItems.some(i => i.originalUrl === fullUrl)) return;

                listItems.push({
                    title,
                    summary: '',
                    originalUrl: fullUrl,
                    imageUrl: '',
                    category: 'Society',
                    source: 'VNA',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });

        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title}`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    },
                    timeout: 15000
                });
                const $detail = cheerio.load(detailData);

                // 내용 셀렉터 (문서에 따르면 .sample-grl 사용)
                let content = $detail('.sample-grl, .article-content, .content').html();

                // 이미지 추출
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                }

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary || item.title;
                }

                detailedItems.push(item);
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (err) {
                console.error(`Failed to fetch details for ${item.originalUrl}:`, err.message);
                item.content = item.summary || item.title;
                detailedItems.push(item);
            }
        }

        return detailedItems;
    } catch (error) {
        console.error('VNA Net crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlVnaNet;


