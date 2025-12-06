const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnExpressVN() {
    console.log('Starting crawl of VnExpress Vietnamese...');
    try {
        const { data } = await axios.get('https://vnexpress.net/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];

        // Selectors for VnExpress VN - Robust
        $('.item-news, .list-news-subfolder .item-news').each((index, element) => {
            if (index > 5) return;

            const titleElement = $(element).find('.title-news a, .title_news a');
            const title = titleElement.text().trim();
            const url = titleElement.attr('href');
            const summary = $(element).find('.description a, .lead_news_site a').text().trim();
            const imageElement = $(element).find('img');
            let imageUrl = imageElement.attr('src') || imageElement.attr('data-src');

            if (title && url) {
                listItems.push({
                    title,
                    summary,
                    originalUrl: url,
                    imageUrl: imageUrl,
                    category: 'Society',
                    source: 'VnExpress VN',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });

        // Fallback
        if (listItems.length === 0) {
            $('h3 a, h2 a').each((index, element) => {
                if (index > 5) return;
                const title = $(element).text().trim();
                const url = $(element).attr('href');
                if (title && url) {
                    listItems.push({
                        title,
                        summary: '',
                        originalUrl: url,
                        imageUrl: '',
                        category: 'Society',
                        source: 'VnExpress VN',
                        publishedAt: new Date(),
                        status: 'DRAFT'
                    });
                }
            });
        }

        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title}`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                // Content selector
                let content = $detail('.fck_detail, .sidebar-1, .content-detail, article.fck_detail, .container .sidebar-1').html();

                // Improve Image Extraction from Detail Page
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                }

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary;
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
    } catch (error) {
        console.error('VnExpress VN crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlVnExpressVN;
