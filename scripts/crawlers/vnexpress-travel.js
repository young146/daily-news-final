const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnExpressTravel() {
    console.log('Starting crawl of VnExpress Travel...');
    try {
        const { data } = await axios.get('https://vnexpress.net/du-lich', {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];
        const seen = new Set();

        $('.item-news, .item-topstory, article.item-news, h3 a, h2 a').each((index, el) => {
            if (listItems.length >= 10) return;

            let titleEl, url;
            if ($(el).is('a')) {
                titleEl = $(el);
                url = $(el).attr('href');
            } else {
                titleEl = $(el).find('.title-news a, .title_news a, h3 a, h2 a, a').first();
                url = titleEl.attr('href');
            }

            const title = titleEl.text().trim();
            const summary = $(el).find('.description a, .lead_news_site a').text().trim() || '';

            if (title && url && title.length > 20 && !seen.has(url)) {
                seen.add(url);
                if (!url.startsWith('http')) {
                    url = `https://vnexpress.net${url}`;
                }
                listItems.push({ title, summary, url });
            }
        });

        const detailedItems = [];
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            try {
                const { data: detailData } = await axios.get(item.url, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                const content = $detail('.fck_detail, article.fck_detail, .content_detail').html();
                const imageUrl = $detail('meta[property="og:image"]').attr('content') || 
                                $detail('.fck_detail img').first().attr('src') || '';

                detailedItems.push({
                    title: item.title,
                    summary: item.summary || item.title,
                    content: content || item.summary,
                    originalUrl: item.url,
                    imageUrl: imageUrl,
                    source: 'VnExpress Travel',
                    category: 'Travel',
                    viewCount: i + 1,
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });

                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`Error fetching details for ${item.url}:`, err.message);
            }
        }

        console.log(`VnExpress Travel: ${detailedItems.length} items`);
        return detailedItems;
    } catch (error) {
        console.error('VnExpress Travel crawl error:', error.message);
        return [];
    }
}

module.exports = crawlVnExpressTravel;

