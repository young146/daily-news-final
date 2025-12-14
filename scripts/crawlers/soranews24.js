const axios = require('axios');
const cheerio = require('cheerio');

async function crawlSoraNews24() {
    console.log('Starting crawl of SoraNews24 (음식/펫/여행)...');
    try {
        const categories = [
            { url: 'https://soranews24.com/category/animals/', category: 'Culture' },
            { url: 'https://soranews24.com/category/food-drink/', category: 'Culture' },
            { url: 'https://soranews24.com/category/travel/', category: 'Culture' },
        ];

        const listItems = [];
        const seen = new Set();

        for (const cat of categories) {
            try {
                console.log(`Fetching: ${cat.url}`);
                const { data } = await axios.get(cat.url, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $ = cheerio.load(data);

                $('a').each((index, element) => {
                    if (listItems.length >= 20) return;

                    const href = $(element).attr('href') || '';
                    const title = $(element).text().trim();

                    if (!title || title.length < 30 || title.length > 200) return;

                    const currentYear = new Date().getFullYear();
                    const lastYear = currentYear - 1;
                    if (!href.includes(`soranews24.com/${currentYear}/`) &&
                        !href.includes(`soranews24.com/${lastYear}/`)) return;

                    if (seen.has(href)) return;
                    seen.add(href);

                    listItems.push({
                        title,
                        summary: '',
                        originalUrl: href,
                        imageUrl: '',
                        category: cat.category,
                        source: 'SoraNews24',
                        publishedAt: new Date(),
                        status: 'DRAFT'
                    });
                });

                await new Promise(r => setTimeout(r, 300));
            } catch (e) {
                console.log(`SoraNews24 category error (${cat.url}):`, e.message);
            }
        }

        console.log(`SoraNews24 list items found: ${listItems.length}`);

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

                let content = $detail('.entry-content, .post-content, .article-body').html();

                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                }

                if (content) {
                    item.content = content.trim();
                    const textContent = $detail('.entry-content').text().trim();
                    item.summary = textContent.substring(0, 300);
                }

                detailedItems.push(item);
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`Error fetching details for ${item.originalUrl}:`, err.message);
                detailedItems.push(item);
            }
        }

        console.log(`SoraNews24: ${detailedItems.length} items with details`);
        return detailedItems;
    } catch (error) {
        console.error('Error crawling SoraNews24:', error.message);
        return [];
    }
}

module.exports = crawlSoraNews24;
