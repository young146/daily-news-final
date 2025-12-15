const axios = require('axios');
const cheerio = require('cheerio');

const LIST_URL = 'https://vnanet.vn/en';

function toAbsolute(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `${LIST_URL.replace('/en', '')}${url.startsWith('/') ? url : `/${url}`}`;
}

module.exports = async function crawlVnaNet() {
    console.log('Starting crawl of VNA (vnanet.vn)...');

    try {
        const { data } = await axios.get(LIST_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });

        const $ = cheerio.load(data);
        const listItems = [];

        // Try multiple selectors to gather top stories
        $('article, .article-item, .item-news, .news-item, .post, .story').each((index, element) => {
            if (listItems.length >= 10) return;

            const titleEl = $(element).find('h3 a, h2 a, .title a').first();
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            const summary = $(element).find('.sapo, .description, .desc, p').first().text().trim();
            const imgEl = $(element).find('img').first();
            let imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || '';

            if (!title || !url) return;

            imageUrl = toAbsolute(imageUrl);
            const fullUrl = toAbsolute(url);

            // Avoid duplicates
            if (listItems.some(i => i.originalUrl === fullUrl)) return;

            listItems.push({
                title,
                summary,
                originalUrl: fullUrl,
                imageUrl,
                category: 'Society',
                source: 'VNA',
                publishedAt: new Date(),
                status: 'DRAFT'
            });
        });

        const detailedItems = [];

        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title}`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    },
                    timeout: 15000
                });

                const $detail = cheerio.load(detailData);

                // Capture og:image first
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = toAbsolute(metaImage);
                }

                // Multiple possible content selectors
                let content =
                    $detail('.article-content').html() ||
                    $detail('.detail-content').html() ||
                    $detail('.content-detail').html() ||
                    $detail('.article-body').html() ||
                    $detail('.post-content').html() ||
                    $detail('.content').html();

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary || '';
                }

                detailedItems.push(item);
                await new Promise(resolve => setTimeout(resolve, 800));
            } catch (err) {
                console.error(`Failed to fetch details for ${item.originalUrl}:`, err.message);
                item.content = item.summary || '';
                detailedItems.push(item);
            }
        }

        console.log(`VNA crawl done. Items: ${detailedItems.length}`);
        return detailedItems;
    } catch (error) {
        console.error('VNA crawl failed:', error.message);
        return [];
    }
};
const axios = require('axios');
const cheerio = require('cheerio');

async function crawlVnaNet() {
    console.log('Starting crawl of VNA Net...');
    try {
        // VNA Net 크롤링 로직
        // 현재는 기본 구조만 제공 (필요시 구현)
        const { data } = await axios.get('https://vnanet.vn/en/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });
        const $ = cheerio.load(data);
        const listItems = [];

        // VNA Net 셀렉터 (문서에 따르면 a[href*=".html"] 사용)
        $('a[href*=".html"]').each((index, element) => {
            if (index > 9) return;

            const title = $(element).text().trim();
            const url = $(element).attr('href');

            if (title && url && title.length > 10) {
                const fullUrl = url.startsWith('http') ? url : `https://vnanet.vn${url}`;
                
                // 중복 체크
                if (listItems.some(i => i.originalUrl === fullUrl)) return;

                listItems.push({
                    title,
                    summary: '',
                    originalUrl: fullUrl,
                    imageUrl: '',
                    category: 'Society',
                    source: 'VNA',
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
                    },
                    timeout: 15000
                });
                const $detail = cheerio.load(detailData);

                // 내용 셀렉터 (문서에 따르면 .sample-grl 사용)
                let content = $detail('.sample-grl, .article-content, .content').html();

                // 이미지 추출
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                }

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary || item.title;
                }

                detailedItems.push(item);
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (err) {
                console.error(`Failed to fetch details for ${item.originalUrl}:`, err.message);
                item.content = item.summary || item.title;
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


