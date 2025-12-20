const axios = require('axios');
const cheerio = require('cheerio');

async function crawlPublicSecurity() {
    console.log('Starting crawl of Public Security News (en.cand.com.vn)...');
    try {
        const { data } = await axios.get('https://en.cand.com.vn/', {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];
        const seen = new Set();

        $('a[href]').each((index, element) => {
            if (listItems.length >= 10) return;

            const title = $(element).text().trim();
            const link = $(element).attr('href');

            if (!title || title.length < 20 || title.length > 200) return;
            if (!link || link === '/' || link.startsWith('#')) return;

            const isArticle = link.includes('-i') || link.match(/[a-z]-[0-9]+\/?$/);
            const isCategory = link.match(/^\/(politics|public-security-forces|culture-travel|economy)\/?$/);
            if (isCategory || !isArticle) return;

            const fullUrl = link.startsWith('http') ? link : `https://en.cand.com.vn${link}`;

            if (seen.has(fullUrl)) return;
            seen.add(fullUrl);

            let category = 'Policy';
            if (link.includes('/public-security')) category = 'Society';
            if (link.includes('/culture')) category = 'Culture';
            if (link.includes('/economy')) category = 'Economy';

            listItems.push({
                title,
                summary: '',
                originalUrl: fullUrl,
                imageUrl: '',
                category,
                source: 'PublicSecurity',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
        });

        console.log(`Public Security list items found: ${listItems.length}`);

        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                let content = $detail('.entry-content, .post-content, .article-content, .detail-content').html();

                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                }

                if (content) {
                    item.content = content.trim();
                    const textContent = $detail('.entry-content, .post-content').text().trim();
                    item.summary = textContent.substring(0, 300);
                }

                detailedItems.push(item);
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`Error fetching details for ${item.originalUrl}:`, err.message);
                detailedItems.push(item);
            }
        }

        console.log(`Public Security: ${detailedItems.length} items with details`);
        return detailedItems;
    } catch (error) {
        console.error('Error crawling Public Security:', error.message);
        return [];
    }
}

module.exports = crawlPublicSecurity;
