const axios = require('axios');
const cheerio = require('cheerio');

async function crawlTuoitre() {
    console.log('Starting crawl of Tuoi Tre News...');
    try {
        const { data } = await axios.get('https://tuoitrenews.vn/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];

        // Selectors based on debug: direct link search
        $('h3 a, h2 a').each((index, element) => {
            if (index > 9) return;

            const title = $(element).text().trim();
            const url = $(element).attr('href');

            // Traverse up to find container for summary/image
            const container = $(element).closest('li') || $(element).closest('div');
            const summary = container.find('.sapo, .description, p').text().trim();
            const imageElement = container.find('img');
            let imageUrl = imageElement.attr('src') || imageElement.attr('data-src');

            if (title && url && url.includes('.htm')) {
                // Fix relative URLs
                const fullUrl = url.startsWith('http') ? url : `https://tuoitrenews.vn${url}`;

                listItems.push({
                    title,
                    summary,
                    originalUrl: fullUrl,
                    imageUrl: imageUrl,
                    category: 'Society',
                    source: 'Tuoi Tre News',
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
                    }
                });
                const $detail = cheerio.load(detailData);

                // Content selector - trying multiple common patterns
                let content = $detail('#main-detail-body, .content-detail, .main-content-body, .fck_detail, article .content, .detail-content, #content').html();

                // Improve Image Extraction from Detail Page (og:image is usually best)
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
        console.error('Tuoi Tre crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlTuoitre;
