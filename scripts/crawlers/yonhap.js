const axios = require('axios');
const cheerio = require('cheerio');

async function crawlYonhap() {
    console.log('Starting crawl of Yonhap News (Asia/Australia)...');
    try {
        const { data } = await axios.get('https://www.yna.co.kr/international/asia-australia', {
            timeout: 20000, // 5초로 단축 (Vercel 타임아웃 방지)
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const items = [];

        // Process items to fetch full content
        const detailedItems = [];
        const listItems = [];

        // Selector for Yonhap list items
        $('.list-type212 li').each((i, el) => {
            if (i >= 5) return; // 최대 5개 (타임아웃 방지)

            const titleEl = $(el).find('.tit-news');
            const title = titleEl.text().trim();
            const link = titleEl.attr('href');

            const summary = $(el).find('.lead').text().trim();
            // ⚠️ 연합뉴스 사진은 저작권 리스크로 수집하지 않는다 (2026-08-16)

            if (title && link) {
                listItems.push({
                    title,
                    summary,
                    originalUrl: link,
                    imageUrl: null,
                    category: 'Society', // Default
                    source: 'Yonhap News',
                    publishedAt: new Date(), // Approximate
                    status: 'DRAFT'
                });
            }
        });

        // Fetch details for each item
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title}`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 20000, // 5초로 단축
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                // Yonhap English content selector
                let content = $detail('.article-txt').html() || $detail('.story-news').html();

                // ⚠️ 연합뉴스 사진(og:image)은 저작권 리스크로 수집하지 않는다 (2026-08-16)

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary; // Fallback
                }

                detailedItems.push(item);
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (err) {
                console.error(`Failed to fetch details for ${item.originalUrl}:`, err.message);
                item.content = item.summary;
                detailedItems.push(item);
            }
        }

        return detailedItems;

        return items;
    } catch (error) {
        console.error('Yonhap crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlYonhap;
