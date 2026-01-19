const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://kr.saigoneer.com';

async function crawlSaigoneer() {
    console.log('Starting crawl of Saigoneer 한글판 (음식/여행)...');
    try {
        const categories = [
            { url: `${BASE_URL}/eat-drink`, category: 'Culture' },
            { url: `${BASE_URL}/%EA%B8%B8%EA%B1%B0%EB%A6%AC-%EC%9D%8C%EC%8B%9D`, category: 'Culture' },
            { url: `${BASE_URL}/%EA%B4%80%EA%B4%91`, category: 'Culture' },
        ];

        const listItems = [];
        const seen = new Set();

        for (const cat of categories) {
            try {
                console.log(`Fetching: ${cat.url}`);
                const { data } = await axios.get(cat.url, {
                    timeout: 20000, // 5초로 단축 (Vercel 타임아웃 방지)
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $ = cheerio.load(data);

                $('a').each((index, element) => {
                    if (listItems.length >= 5) return; // 최대 5개 (타임아웃 방지)

                    let href = $(element).attr('href') || '';
                    const title = $(element).text().trim().replace(/\s+/g, ' ');

                    if (!title || title.length < 15 || title.length > 200) return;
                    if (!href) return;

                    const hasArticleId = href.match(/\/\d+-/);
                    if (!hasArticleId) return;

                    if (href.includes('/explore/') || href.includes('/support')) return;

                    if (href.startsWith('/')) {
                        href = BASE_URL + href;
                    }

                    if (seen.has(href)) return;
                    seen.add(href);

                    const cleanTitle = title.split(' - ').pop().trim();

                    listItems.push({
                        title: cleanTitle,
                        summary: '',
                        originalUrl: href,
                        imageUrl: '',
                        category: cat.category,
                        source: 'Saigoneer',
                        publishedAt: new Date(),
                        status: 'DRAFT'
                    });
                });

                await new Promise(r => setTimeout(r, 300));
            } catch (e) {
                console.log(`Saigoneer category error (${cat.url}):`, e.message);
            }
        }

        console.log(`Saigoneer 한글판 list items found: ${listItems.length}`);

        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 20000, // 5초로 단축
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                let content = $detail('.item-page, .itemFullText, .article-content').html();

                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                }

                const ogTitle = $detail('meta[property="og:title"]').attr('content');
                if (ogTitle) {
                    item.title = ogTitle.replace(/\s*\|\s*Saigoneer.*$/i, '').trim();
                }

                if (content) {
                    item.content = content.trim();
                    const textContent = $detail('.item-page').text().trim();
                    item.summary = textContent.substring(0, 300);
                }

                detailedItems.push(item);
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`Error fetching details for ${item.originalUrl}:`, err.message);
                detailedItems.push(item);
            }
        }

        console.log(`Saigoneer 한글판: ${detailedItems.length} items with details`);
        return detailedItems;
    } catch (error) {
        console.error('Error crawling Saigoneer:', error.message);
        return [];
    }
}

module.exports = crawlSaigoneer;
