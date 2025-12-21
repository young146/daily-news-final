const axios = require('axios');
const cheerio = require('cheerio');

async function crawlPetMD() {
    console.log('[PetMD] Starting crawl...');
    try {
        console.log('[PetMD] Fetching homepage...');
        let data;
        try {
            const response = await axios.get('https://www.petmd.com/', {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.google.com/'
                },
                maxRedirects: 5,
                validateStatus: function (status) {
                    return status >= 200 && status < 400;
                }
            });
            data = response.data;
        } catch (e) {
            console.error('[PetMD] Homepage fetch error:', e.message);
            if (e.response && e.response.status === 403) {
                console.log('[PetMD] 403 error - trying alternative approach...');
                // 403 에러 시 재시도 (간단한 헤더로)
                try {
                    const retryResponse = await axios.get('https://www.petmd.com/', {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });
                    data = retryResponse.data;
                } catch (retryError) {
                    console.error('[PetMD] Retry also failed:', retryError.message);
                    return [];
                }
            } else {
                return [];
            }
        }
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        // 최근 30일 기준 날짜 계산
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        $('a').each((i, el) => {
            if (listItems.length >= 10) return false;
            
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            
            if (!title || title.length < 15 || title.length > 200) return;
            if (!href || !href.includes('petmd.com/')) return;
            if (href.includes('/tag/') || href.includes('/author/') || href.includes('/category/') || href.includes('/search')) return;
            
            // URL에서 날짜 추출 (YYYY/MM/DD 형식)
            const dateMatch = href.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
            if (dateMatch) {
                const articleDate = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
                if (articleDate < thirtyDaysAgo) return; // 30일 이전 기사 제외
            }
            
            // 기사 URL 패턴 확인
            const isArticle = (href.match(/\/\d{4}\/\d{2}\//) || href.match(/\/[a-z-]+\/[a-z-]+/)) && !href.endsWith('/');
            if (!isArticle) return;
            
            const fullUrl = href.startsWith('http') ? href : `https://www.petmd.com${href}`;
            
            if (seen.has(fullUrl)) return;
            seen.add(fullUrl);
            
            listItems.push({ title, url: fullUrl });
        });
        
        console.log(`[PetMD] List items found: ${listItems.length}`);
        
        const detailedItems = [];
        for (const item of listItems.slice(0, 10)) {
            try {
                console.log(`[PetMD] Fetching details: ${item.title.substring(0, 50)}...`);
                let detailData;
                try {
                    const detailResponse = await axios.get(item.url, {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Referer': 'https://www.petmd.com/'
                        }
                    });
                    detailData = detailResponse.data;
                } catch (detailError) {
                    if (detailError.response && detailError.response.status === 403) {
                        // 403 에러 시 간단한 헤더로 재시도
                        const retryResponse = await axios.get(item.url, {
                            timeout: 15000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            }
                        });
                        detailData = retryResponse.data;
                    } else {
                        throw detailError;
                    }
                }
                const $detail = cheerio.load(detailData);
                
                const content = $detail('article .content').html();
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                const imageUrl = metaImage || '';
                
                const summary = content ? 
                    $detail('article .content').text().trim().substring(0, 300) : 
                    item.title;
                
                detailedItems.push({
                    title: item.title,
                    summary: summary,
                    content: content ? content.trim() : null,
                    originalUrl: item.url,
                    imageUrl: imageUrl,
                    source: 'PetMD',
                    category: 'Culture',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
                
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`[PetMD] Detail error for ${item.url}:`, e.message);
                detailedItems.push({
                    title: item.title,
                    summary: item.title,
                    content: null,
                    originalUrl: item.url,
                    imageUrl: null,
                    source: 'PetMD',
                    category: 'Culture',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        }
        
        console.log(`[PetMD] Final items: ${detailedItems.length}`);
        return detailedItems;
    } catch (e) {
        console.error('[PetMD] Crawl error:', e.message);
        return [];
    }
}

module.exports = crawlPetMD;

