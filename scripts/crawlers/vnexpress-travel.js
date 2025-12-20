const axios = require('axios');
const cheerio = require('cheerio');
const { getVietnamTime } = require('../date-utils');

/**
 * VnExpress Travel 크롤러
 */

async function fetchDetailPage(url, contentSelectors) {
    try {
        const { data } = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        const $ = cheerio.load(data);
        
        let content = null;
        for (const selector of contentSelectors) {
            const found = $(selector);
            if (found.length > 0) {
                content = found.html();
                break;
            }
        }
        
        const imageUrl = $('meta[property="og:image"]').attr('content') || 
                         $('meta[name="twitter:image"]').attr('content') || '';
        
        return { content: content || '', imageUrl };
    } catch (e) {
        console.error(`Error fetching detail page ${url}:`, e.message);
        return { content: null, imageUrl: null };
    }
}

async function crawlVnExpressTravel() {
    const items = [];
    try {
        console.log('Crawling VnExpress Travel...');
        const { data } = await axios.get('https://vnexpress.net/du-lich', {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        // 다양한 선택자로 뉴스 아이템 찾기
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
        
        for (let i = 0; i < listItems.length; i++) {
            const item = listItems[i];
            const detail = await fetchDetailPage(item.url, ['.fck_detail', 'article.fck_detail', '.content_detail']);
            items.push({
                title: item.title,
                summary: item.summary || item.title,
                content: detail.content,
                originalUrl: item.url,
                imageUrl: detail.imageUrl,
                source: 'VnExpress Travel',
                category: 'Travel',
                viewCount: i + 1,
                publishedAt: getVietnamTime(),
                status: 'DRAFT'
            });
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`VnExpress Travel: ${items.length} items`);
    } catch (e) {
        console.error('VnExpress Travel crawl error:', e.message);
    }
    return items;
}

module.exports = crawlVnExpressTravel;

