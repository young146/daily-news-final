const axios = require('axios');
const cheerio = require('cheerio');

async function crawlTheDodo() {
    console.log('[The Dodo] Starting crawl...');
    try {
        console.log('[The Dodo] Fetching homepage...');
        const { data } = await axios.get('https://www.thedodo.com/', {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        // 최근 30일 기준 날짜 계산
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        $('a').each((i, el) => {
            if (listItems.length >= 5) return false; // 최대 5개 (타임아웃 방지)
            
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            
            if (!title || title.length < 10 || title.length > 200) return;
            if (!href) return;
            
            // 상대 URL 처리
            let fullUrl = href.startsWith('http') ? href : `https://www.thedodo.com${href.startsWith('/') ? href : '/' + href}`;
            
            if (!fullUrl.includes('thedodo.com/')) return;
            if (fullUrl.includes('/tag/') || fullUrl.includes('/author/') || fullUrl.includes('/category/') || fullUrl.includes('/search') || fullUrl.includes('/about')) return;
            if (fullUrl.endsWith('/') && fullUrl.split('/').length <= 4) return; // 루트나 카테고리 페이지 제외
            
            // 기사 URL 패턴 확인 - thedodo.com/카테고리/제목 형식
            const pathParts = fullUrl.replace('https://www.thedodo.com/', '').split('/').filter(p => p);
            if (pathParts.length < 2) return; // 최소 2개 경로 세그먼트 필요
            
            if (seen.has(fullUrl)) return;
            seen.add(fullUrl);
            
            listItems.push({ title, url: fullUrl });
        });
        
        console.log(`[The Dodo] Initial links found: ${listItems.length}`);
        
        // 날짜 필터링: 상세 페이지에서 날짜 확인 (최대 10개만 확인)
        const filteredItems = [];
        for (const item of listItems.slice(0, 5)) { // 최대 5개 처리
            try {
                const { data: checkData } = await axios.get(item.url, {
                    timeout: 5000, // 5초로 단축 (Vercel 타임아웃 방지)
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Referer': 'https://www.thedodo.com/'
                    }
                });
                const $check = cheerio.load(checkData);
                
                // 날짜 메타 태그에서 날짜 추출
                const dateStr = $check('meta[property="article:published_time"]').attr('content') || 
                               $check('time[datetime]').attr('datetime') ||
                               $check('time').attr('datetime');
                
                if (dateStr) {
                    const articleDate = new Date(dateStr);
                    if (articleDate >= thirtyDaysAgo) {
                        filteredItems.push(item);
                    }
                } else {
                    // 날짜를 찾을 수 없으면 일단 포함 (메인 페이지에 있으면 최신일 가능성 높음)
                    filteredItems.push(item);
                }
            } catch (e) {
                // 에러나면 일단 포함
                filteredItems.push(item);
            }
        }
        
        // 필터링된 항목으로 교체
        listItems.length = 0;
        listItems.push(...filteredItems);
        
        console.log(`[The Dodo] List items found: ${listItems.length}`);
        
        const detailedItems = [];
        for (const item of listItems.slice(0, 5)) { // 최대 5개 처리
            try {
                console.log(`[The Dodo] Fetching details: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.url, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Referer': 'https://www.thedodo.com/'
                    }
                });
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
                        console.log(`[The Dodo] Skipping ${item.url}: content too short (${textContent.length} chars)`);
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
                        imageUrl = articleImage.startsWith('http') ? articleImage : `https://www.thedodo.com${articleImage}`;
                    }
                }
                
                // 3. article 내 figure 이미지
                if (!imageUrl || imageUrl.includes('logo')) {
                    const figureImage = $detail('article figure img').first().attr('src');
                    if (figureImage && !figureImage.includes('logo')) {
                        imageUrl = figureImage.startsWith('http') ? figureImage : `https://www.thedodo.com${figureImage}`;
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
                    source: 'The Dodo',
                    category: 'Pet',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
                
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`[The Dodo] Detail error for ${item.url}:`, e.message);
                detailedItems.push({
                    title: item.title,
                    summary: item.title,
                    content: null,
                    originalUrl: item.url,
                    imageUrl: null,
                    source: 'The Dodo',
                    category: 'Pet',
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        }
        
        console.log(`[The Dodo] Final items: ${detailedItems.length}`);
        return detailedItems;
    } catch (e) {
        console.error('[The Dodo] Crawl error:', e.message);
        return [];
    }
}

module.exports = crawlTheDodo;

