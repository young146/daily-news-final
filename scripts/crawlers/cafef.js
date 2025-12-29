const axios = require('axios');
const cheerio = require('cheerio');

async function crawlCafef() {
    console.log('Starting crawl of Cafef.vn (Vietnam Economy News)...');
    try {
        const { data } = await axios.get('https://cafef.vn/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];

        // Cafef.vn 메인 페이지 선택자 (실제 사이트 구조에 맞게 수정)
        // .news-item과 .item이 작동함을 확인
        
        // 방법 1: .news-item 선택자 사용
        $('.news-item').each((index, element) => {
            if (listItems.length >= 20) return false;

            const titleEl = $(element).find('a').first();
            const title = titleEl.text().trim();
            let url = titleEl.attr('href');
            
            if (!title || !url || title.length < 20) return;

            // URL 정규화
            if (!url.startsWith('http')) {
                if (url.startsWith('//')) {
                    url = 'https:' + url;
                } else if (url.startsWith('/')) {
                    url = 'https://cafef.vn' + url;
                } else {
                    url = 'https://cafef.vn/' + url;
                }
            }

            // .chn 확장자 확인 (Cafef 뉴스 URL 패턴)
            if (!url.includes('.chn')) return;

            const summary = $(element).find('.sapo, .description, .summary, .lead').text().trim();
            const imageEl = $(element).find('img');
            let imageUrl = imageEl.attr('src') || imageEl.attr('data-src') || imageEl.attr('data-original');

            // 중복 체크
            const isDuplicate = listItems.some(item => item.originalUrl === url);
            if (!isDuplicate) {
                listItems.push({
                    title,
                    summary,
                    originalUrl: url,
                    imageUrl: imageUrl,
                    category: 'Economy',
                    source: 'Cafef',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        });

        // 방법 2: .item 선택자 사용
        if (listItems.length < 15) {
            $('.item').each((index, element) => {
                if (listItems.length >= 20) return false;

                const titleEl = $(element).find('a').first();
                const title = titleEl.text().trim();
                let url = titleEl.attr('href');
                
                if (!title || !url || title.length < 20) return;

                // URL 정규화
                if (!url.startsWith('http')) {
                    if (url.startsWith('//')) {
                        url = 'https:' + url;
                    } else if (url.startsWith('/')) {
                        url = 'https://cafef.vn' + url;
                    } else {
                        url = 'https://cafef.vn/' + url;
                    }
                }

                // .chn 확장자 확인
                if (!url.includes('.chn')) return;

                // 중복 체크
                const isDuplicate = listItems.some(item => item.originalUrl === url);
                if (!isDuplicate) {
                    const summary = $(element).find('.sapo, .description').text().trim();
                    const imageEl = $(element).find('img');
                    let imageUrl = imageEl.attr('src') || imageEl.attr('data-src') || imageEl.attr('data-original');

                    listItems.push({
                        title,
                        summary,
                        originalUrl: url,
                        imageUrl: imageUrl,
                        category: 'Economy',
                        source: 'Cafef',
                        publishedAt: new Date(),
                        status: 'DRAFT'
                    });
                }
            });
        }

        // 방법 3: h3 a, h2 a 직접 링크 수집
        if (listItems.length < 10) {
            $('h3 a, h2 a').each((index, element) => {
                if (listItems.length >= 20) return false;
                
                const url = $(element).attr('href');
                const title = $(element).text().trim();
                
                if (!title || !url || title.length < 20) return;

                // URL 정규화
                let fullUrl = url;
                if (!url.startsWith('http')) {
                    if (url.startsWith('//')) {
                        fullUrl = 'https:' + url;
                    } else if (url.startsWith('/')) {
                        fullUrl = 'https://cafef.vn' + url;
                    } else {
                        fullUrl = 'https://cafef.vn/' + url;
                    }
                }

                // .chn 확장자 확인
                if (!fullUrl.includes('.chn')) return;

                // 중복 체크
                const isDuplicate = listItems.some(item => item.originalUrl === fullUrl);
                if (!isDuplicate) {
                    listItems.push({
                        title,
                        summary: '',
                        originalUrl: fullUrl,
                        imageUrl: '',
                        category: 'Economy',
                        source: 'Cafef',
                        publishedAt: new Date(),
                        status: 'DRAFT'
                    });
                }
            });
        }

        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
                    },
                    timeout: 15000
                });
                const $detail = cheerio.load(detailData);

                // Cafef 본문 선택자 (다양한 패턴 시도)
                let content = $detail('.detail-content, .article-content, .content-detail, .fck_detail, article .content, .post-content, #article-body').html();
                
                // 본문이 없으면 다른 선택자 시도
                if (!content) {
                    content = $detail('article, .main-content, .entry-content').html();
                }

                // 이미지 추출 (og:image 우선)
                let imageUrl = $detail('meta[property="og:image"]').attr('content');
                if (imageUrl) {
                    item.imageUrl = imageUrl;
                } else if (!item.imageUrl) {
                    const firstImg = $detail('.detail-content img, article img, .content img').first().attr('src');
                    if (firstImg) {
                        item.imageUrl = firstImg.startsWith('http') ? firstImg : 'https://cafef.vn' + firstImg;
                    }
                }

                // 요약이 없으면 본문에서 추출
                if (!item.summary && content) {
                    const $content = cheerio.load(content);
                    item.summary = $content('p').first().text().trim().substring(0, 200);
                }

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`No content found for ${item.originalUrl}`);
                    item.content = item.summary || item.title;
                }

                detailedItems.push(item);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 서버 부하 방지

            } catch (err) {
                console.error(`Failed to fetch details for ${item.originalUrl}:`, err.message);
                item.content = item.summary || item.title;
                detailedItems.push(item);
            }
        }

        console.log(`Cafef: ${detailedItems.length} items collected`);
        return detailedItems;
    } catch (error) {
        console.error('Cafef crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlCafef;

