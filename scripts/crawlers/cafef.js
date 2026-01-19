const axios = require('axios');
const cheerio = require('cheerio');

async function crawlCafef() {
    console.log('[Cafef] Starting crawl of Cafef.vn (Vietnam Economy News)...');
    try {
        console.log('[Cafef] Fetching main page...');
        const { data } = await axios.get('https://cafef.vn/', {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        const $ = cheerio.load(data);
        const listItems = [];

        console.log('[Cafef] Parsing list items...');
        // Cafef.vn 메인 페이지 선택자 (실제 사이트 구조에 맞게 수정)
        // .news-item과 .item이 작동함을 확인
        
        // 방법 1: .news-item 선택자 사용
        $('.news-item').each((index, element) => {
            if (listItems.length >= 20) return false; // 최대 20개

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
            console.log('[Cafef] Using secondary selector...');
            $('.item').each((index, element) => {
                if (listItems.length >= 20) return false; // 최대 20개

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
        if (listItems.length < 15) {
            console.log('[Cafef] Using tertiary selector...');
            $('h3 a, h2 a').each((index, element) => {
                if (listItems.length >= 20) return false; // 최대 20개
                
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

        console.log(`[Cafef] Found ${listItems.length} list items`);
        
        // 병렬 처리로 최적화
        const detailedItems = [];
        const BATCH_SIZE = 5;
        
        const fetchDetail = async (item) => {
            try {
                console.log(`[Cafef] Fetching: ${item.title.substring(0, 40)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
                    },
                    timeout: 15000
                });
                const $detail = cheerio.load(detailData);

                let content = $detail('.detail-content, .article-content, .content-detail, .fck_detail, article .content, .post-content, #article-body').html();
                
                if (!content) {
                    content = $detail('article, .main-content, .entry-content').html();
                }

                let imageUrl = $detail('meta[property="og:image"]').attr('content');
                if (imageUrl) {
                    item.imageUrl = imageUrl;
                } else if (!item.imageUrl) {
                    const firstImg = $detail('.detail-content img, article img, .content img').first().attr('src');
                    if (firstImg) {
                        item.imageUrl = firstImg.startsWith('http') ? firstImg : 'https://cafef.vn' + firstImg;
                    }
                }

                if (!item.summary && content) {
                    const $content = cheerio.load(content);
                    item.summary = $content('p').first().text().trim().substring(0, 200);
                }

                if (content) {
                    item.content = content.trim();
                } else {
                    console.warn(`[Cafef] No content for ${item.originalUrl}`);
                    item.content = item.summary || item.title;
                }
                
                return item;
            } catch (err) {
                console.error(`[Cafef] Failed: ${item.title.substring(0, 30)}...`, err.message);
                item.content = item.summary || item.title;
                return item;
            }
        };
        
        for (let i = 0; i < listItems.length; i += BATCH_SIZE) {
            const batch = listItems.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(listItems.length / BATCH_SIZE);
            
            console.log(`[Cafef] Batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
            
            const results = await Promise.all(batch.map(item => fetchDetail(item)));
            detailedItems.push(...results);
            
            if (i + BATCH_SIZE < listItems.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        console.log(`[Cafef] Successfully crawled ${detailedItems.length} items`);
        return detailedItems;
    } catch (error) {
        console.error('[Cafef] Crawl failed:', error.message);
        console.error('[Cafef] Error stack:', error.stack);
        // 에러가 발생해도 빈 배열 리턴하여 다른 크롤러는 계속 진행
        return [];
    }
}

module.exports = crawlCafef;

