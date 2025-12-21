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
        
        // 더 많은 링크 찾기: article, h2, h3 내 링크도 확인
        $('a, article a, h2 a, h3 a, .article-list a, .post-list a').each((i, el) => {
            if (listItems.length >= 30) return false; // 더 많은 링크 수집
            
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            
            if (!title || title.length < 15 || title.length > 200) return;
            if (!href) return;
            
            // 상대 URL 처리
            let fullUrl = href.startsWith('http') ? href : `https://www.petmd.com${href.startsWith('/') ? href : '/' + href}`;
            
            if (!fullUrl.includes('petmd.com/')) return;
            if (fullUrl.includes('/tag/') || fullUrl.includes('/author/') || fullUrl.includes('/category/') || fullUrl.includes('/search') || fullUrl.includes('/about')) return;
            if (fullUrl.endsWith('/') && fullUrl.split('/').length <= 4) return; // 루트나 카테고리 페이지 제외
            
            // URL에서 날짜 추출 (YYYY/MM/DD 형식)
            const dateMatch = fullUrl.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
            if (dateMatch) {
                const articleDate = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
                if (articleDate < thirtyDaysAgo) return; // 30일 이전 기사 제외
            }
            
            // 기사 URL 패턴 확인: 날짜 포함 또는 카테고리/제목 형식
            const isArticle = (fullUrl.match(/\/\d{4}\/\d{2}\//) || fullUrl.match(/\/[a-z-]+\/[a-z-]+/)) && !fullUrl.endsWith('/');
            if (!isArticle) return;
            
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
                
                // 본문 추출: 여러 선택자 시도
                let content = null;
                const contentSelectors = [
                    'article .article-body',
                    'article .content',
                    'article .post-content',
                    'article .entry-content',
                    '.article-body',
                    '.post-content',
                    '.entry-content',
                    '.article-content',
                    'article p',
                    '.content p'
                ];
                
                for (const selector of contentSelectors) {
                    const found = $detail(selector).html();
                    if (found) {
                        const textContent = $detail(selector).text().trim();
                        // 본문이 최소 100자 이상인지 확인
                        if (textContent.length >= 100) {
                            content = found;
                            break;
                        }
                    }
                }
                
                // 본문이 없거나 너무 짧으면 스킵
                if (!content) {
                    const textContent = $detail('article').text().trim();
                    if (textContent.length < 100) {
                        console.log(`[PetMD] Skipping ${item.url}: content too short (${textContent.length} chars)`);
                        continue;
                    }
                    // 마지막 시도: article 전체
                    content = $detail('article').html();
                }
                
                // 이미지 추출: 여러 소스 시도
                let imageUrl = '';
                // 1. og:image 메타 태그
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage && !metaImage.includes('logo') && !metaImage.includes('default')) {
                    imageUrl = metaImage;
                }
                
                // 2. 본문 내 첫 번째 이미지 (og:image가 없거나 로고인 경우)
                if (!imageUrl || imageUrl.includes('logo')) {
                    const articleImage = $detail('article img').first().attr('src');
                    if (articleImage && !articleImage.includes('logo') && !articleImage.includes('avatar')) {
                        imageUrl = articleImage.startsWith('http') ? articleImage : `https://www.petmd.com${articleImage}`;
                    }
                }
                
                // 3. article 내 figure 이미지
                if (!imageUrl || imageUrl.includes('logo')) {
                    const figureImage = $detail('article figure img').first().attr('src');
                    if (figureImage && !figureImage.includes('logo')) {
                        imageUrl = figureImage.startsWith('http') ? figureImage : `https://www.petmd.com${figureImage}`;
                    }
                }
                
                // 본문 텍스트 추출 (HTML에서 텍스트만)
                let textContent = '';
                if (content) {
                    // content는 HTML 문자열이므로 다시 cheerio로 로드
                    const $content = cheerio.load(content);
                    textContent = $content('body').text().trim() || $content.text().trim();
                }
                const summary = textContent ? textContent.substring(0, 300) : item.title;
                
                detailedItems.push({
                    title: item.title,
                    summary: summary,
                    content: content ? content.trim() : null,
                    originalUrl: item.url,
                    imageUrl: imageUrl,
                    source: 'PetMD',
                    category: 'Health',
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

