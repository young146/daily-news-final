const axios = require('axios');
const cheerio = require('cheerio');

async function crawlThanhNien() {
    console.log('Starting crawl of Thanh Nien...');
    try {
        const { data } = await axios.get('https://thanhnien.vn/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];

        // Selectors for Thanh Nien - Robust
        $('.story, .box-news .item, article').each((index, element) => {
            if (index > 9) return;

            const titleElement = $(element).find('.story__heading a, .title a, h3 a, h2 a');
            const title = titleElement.text().trim();
            const url = titleElement.attr('href');
            const summary = $(element).find('.story__summary, .sapo, .summary').text().trim();
            const imageElement = $(element).find('img');
            let imageUrl = imageElement.attr('src') || imageElement.attr('data-src');

            if (title && url) {
                const fullUrl = url.startsWith('http') ? url : `https://thanhnien.vn${url}`;

                listItems.push({
                    title,
                    summary,
                    originalUrl: fullUrl,
                    imageUrl: imageUrl,
                    category: 'Society',
                    source: 'Thanh Nien',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });

        // Fallback if specific classes fail
        if (listItems.length === 0) {
            $('h3 a, h2 a').each((index, element) => {
                if (index > 9) return;
                const title = $(element).text().trim();
                const url = $(element).attr('href');
                if (title && url) {
                    const fullUrl = url.startsWith('http') ? url : `https://thanhnien.vn${url}`;
                    listItems.push({
                        title,
                        summary: '',
                        originalUrl: fullUrl,
                        imageUrl: '',
                        category: 'Society',
                        source: 'Thanh Nien',
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
                let content = $detail('.detail-content, .content-detail, #main-detail-body, .fck_detail').html();

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
        console.error('Thanh Nien crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlThanhNien;
