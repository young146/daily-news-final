const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const crypto = require('crypto');

// Create HTTPS agent that allows legacy SSL renegotiation
const legacyAgent = new https.Agent({
    rejectUnauthorized: false,
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
});

async function crawlVnaNet() {
    console.log('Starting crawl of VNA Net...');
    try {
        const { data } = await axios.get('https://vnanet.vn/en/', {
            httpsAgent: legacyAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];

        // Selectors for VNA Net - URL Pattern Strategy
        $('a[href*=".html"]').each((index, element) => {
            if (listItems.length > 9) return;

            const title = $(element).text().trim();
            const url = $(element).attr('href');

            // Filter out short titles or irrelevant links
            if (!title || title.length < 10) return;

            // Ensure it's an English link if possible (though URL might not show it clearly, usually /en/)
            if (url.includes && !url.includes('/en/')) return;

            // Try to find summary/image in parent container
            const container = $(element).closest('li') || $(element).closest('div') || $(element).closest('td');
            const summary = container.find('.news-sapo, .sapo, .summary, p').text().trim();
            const imageElement = container.find('img');
            let imageUrl = imageElement.attr('src');

            if (title && url) {
                const fullUrl = url.startsWith('http') ? url : `https://vnanet.vn${url}`;

                // Avoid duplicates in the list
                if (listItems.some(i => i.originalUrl === fullUrl)) return;

                listItems.push({
                    title,
                    summary,
                    originalUrl: fullUrl,
                    imageUrl: imageUrl,
                    category: 'Society',
                    source: 'VNA Net',
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
                    httpsAgent: legacyAgent,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                // VNA is a photo gallery site - content is in captions
                // Try multiple selectors for content
                let content = $detail('.sample-grl').text().trim();
                
                if (!content) {
                    content = $detail('.caption-slider').text().trim();
                }
                
                if (!content) {
                    content = $detail('.separator-right').text().trim();
                }
                
                if (!content) {
                    content = $detail('.news-detail, .detail-content, .content-detail, .fck_detail').text().trim();
                }

                // Improve Image Extraction from Detail Page
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                }
                
                // Also try to get first image from slider
                if (!item.imageUrl) {
                    const sliderImg = $detail('.slider-glr img').first().attr('src');
                    if (sliderImg) {
                        item.imageUrl = sliderImg.startsWith('http') ? sliderImg : `https://vnanet.vn${sliderImg}`;
                    }
                }

                if (content && content.length > 50) {
                    // Clean up the content - remove date/source prefixes
                    content = content.replace(/^VNA Photos\s*/i, '');
                    content = content.replace(/\d{2}\/\d{2}\/\d{4}\s*\d{2}:\d{2}\s*\|\s*TTXVN\s*/g, '');
                    item.content = `<p>${content.trim()}</p>`;
                    console.log(`[VNA] Found content (${content.length} chars)`);
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary ? `<p>${item.summary}</p>` : '';
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
        console.error('VNA Net crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlVnaNet;
