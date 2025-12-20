const axios = require('axios');
const cheerio = require('cheerio');
const { getVietnamTime } = require('../date-utils');

async function crawlVnExpress() {
    console.log('Starting crawl of VnExpress International...');
    try {
        const { data } = await axios.get('https://e.vnexpress.net/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const items = [];

        // Process items to fetch full content
        const detailedItems = [];
        const listItems = [];

        $('.item-news, .item-topstory').each((index, element) => {
            if (index > 9) return;

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
                    publishedAt: getVietnamTime(),
                    status: 'DRAFT'
                });
            }
        });

        // Fetch details for each item
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title}`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                // VnExpress English content selector
                // Usually .fck_detail or .main_content_detail
                let content = $detail('.fck_detail').html();

                // Cleanup content (remove scripts, styles, ads if possible)
                if (content) {
                    // Simple cleanup: remove empty tags or specific classes if needed
                    // For now, just taking the HTML
                    item.content = content.trim();
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary; // Fallback
                }

                detailedItems.push(item);

                // Be nice to the server
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (err) {
                console.error(`Failed to fetch details for ${item.originalUrl}:`, err.message);
                // Push item anyway with summary as content fallback
                item.content = item.summary;
                detailedItems.push(item);
            }
        }

        return detailedItems;
    } catch (error) {
        console.error('VnExpress crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlVnExpress;
