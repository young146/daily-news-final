const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.petmd.com';

async function crawlPetMD() {
    console.log('Starting crawl of PetMD (Pet News)...');
    try {
        const { data } = await axios.get(`${BASE_URL}/`, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];
        const seen = new Set();

        // Find article links
        $('a[href*="/dog/"], a[href*="/cat/"], a[href*="/pet/"], article a, .article-card a, .story-card a').each((index, element) => {
            if (listItems.length >= 10) return;

            const href = $(element).attr('href') || '';
            let url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            
            if (!url.includes('/dog/') && !url.includes('/cat/') && !url.includes('/pet/')) return;
            if (seen.has(url)) return;
            seen.add(url);

            const title = $(element).text().trim() || $(element).find('h2, h3, .title, .headline').text().trim();
            if (!title || title.length < 20 || title.length > 200) return;

            const container = $(element).closest('article, .article-card, .story-card, .card') || $(element).parent();
            const summary = container.find('.summary, .excerpt, .description, p').first().text().trim();
            const imageEl = container.find('img').first();
            let imageUrl = imageEl.attr('src') || imageEl.attr('data-src') || imageEl.attr('data-lazy-src');

            listItems.push({
                title,
                summary: summary || title,
                originalUrl: url,
                imageUrl: imageUrl || '',
                category: 'Pet',
                source: 'PetMD',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
        });

        console.log(`PetMD list items found: ${listItems.length}`);

        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                // Try multiple content selectors
                const contentSelectors = [
                    '.article-body',
                    '.article-content',
                    '.post-content',
                    'article .content',
                    '.entry-content',
                    'main article',
                    '.article-text'
                ];

                let content = '';
                for (const selector of contentSelectors) {
                    content = $detail(selector).html();
                    if (content && content.length > 100) break;
                }

                // Fallback: get all paragraphs
                if (!content || content.length < 100) {
                    const paragraphs = $detail('article p, .article-body p, .post-content p').map((i, el) => $detail(el).html()).get();
                    content = paragraphs.join('');
                }

                // Get image from meta or content
                if (!item.imageUrl) {
                    item.imageUrl = $detail('meta[property="og:image"]').attr('content') || 
                                   $detail('.article-image img, .post-image img, article img').first().attr('src') || '';
                }

                if (content && content.length > 100) {
                    item.content = content.trim();
                    const textContent = $detail('article p, .article-body p').text().trim();
                    item.summary = textContent.substring(0, 300) || item.summary;
                } else {
                    item.content = item.summary;
                }

                detailedItems.push(item);
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`Error fetching details for ${item.originalUrl}:`, err.message);
                detailedItems.push(item);
            }
        }

        console.log(`PetMD: ${detailedItems.length} items with details`);
        return detailedItems;
    } catch (error) {
        console.error('Error crawling PetMD:', error.message);
        return [];
    }
}

module.exports = crawlPetMD;

