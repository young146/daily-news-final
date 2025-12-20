const axios = require('axios');
const cheerio = require('cheerio');
const { getVietnamTime } = require('../date-utils');

async function crawlInsideVina() {
    console.log('Starting crawl of InsideVina...');
    try {
        const { data } = await axios.get('http://www.insidevina.com/news/articleList.html?sc_section_code=S1N1&view_type=sm', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];

        // Selectors for InsideVina - URL Pattern Strategy
        $('a[href*="articleView.html"]').each((index, element) => {
            if (listItems.length > 9) return;

            const title = $(element).text().trim();
            const url = $(element).attr('href');

            // Filter out short titles or irrelevant links
            if (!title || title.length < 10) return;

            // Try to find summary/image in parent container
            const container = $(element).closest('li') || $(element).closest('div') || $(element).closest('td');
            const summary = container.find('.lead, .summary, p, .list-summary').text().trim();
            const imageElement = container.find('img, .list-image');
            let imageUrl = imageElement.attr('src');

            if (!imageUrl && imageElement.css('background-image')) {
                imageUrl = imageElement.css('background-image').replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
            }

            if (title && url) {
                const fullUrl = url.startsWith('http') ? url : `http://www.insidevina.com${url}`;

                // Avoid duplicates in the list
                if (listItems.some(i => i.originalUrl === fullUrl)) return;

                listItems.push({
                    title,
                    summary,
                    originalUrl: fullUrl,
                    imageUrl: imageUrl,
                    category: 'Economy',
                    source: 'InsideVina',
                    publishedAt: getVietnamTime(),
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
                    }
                });
                const $detail = cheerio.load(detailData);

                // Content selector
                let content = $detail('#article-view-content-div, .article-body, .view-content').html();

                // Improve Image Extraction from Detail Page
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage.startsWith('http') ? metaImage : `http://www.insidevina.com${metaImage}`;
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
        console.error('InsideVina crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlInsideVina;
