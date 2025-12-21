const axios = require('axios');
const cheerio = require('cheerio');

async function crawlSoraNews24() {
    console.log('[SoraNews24] Starting crawl...');
    try {
        console.log('[SoraNews24] Fetching homepage...');
        const { data } = await axios.get('https://soranews24.com/', {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.google.com/'
            }
        });
        const $ = cheerio.load(data);
        
        const listItems = [];
        const seen = new Set();
        
        // 최근 30일 기준 날짜 계산
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        $('a').each((i, el) => {
            if (listItems.length >= 15) return false;
            
            const href = $(el).attr('href') || '';
            const title = $(el).text().trim();
            
            if (!title || title.length < 20 || title.length > 200) return;
            if (!href || !href.includes('soranews24.com/')) return;
            if (href.includes('/category/') || href.includes('/author/') || href.includes('/tag/')) return;
            
            // URL에서 날짜 추출 (YYYY/MM/DD 형식)
            const dateMatch = href.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
            if (dateMatch) {
                const articleDate = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
                if (articleDate < thirtyDaysAgo) return; // 30일 이전 기사 제외
            } else {
                // 날짜가 없으면 기사 URL이 아닐 수 있음
                if (!href.match(/\/\d{4}\/\d{2}\/\d{2}\//)) return;
            }
            
            if (seen.has(href)) return;
            seen.add(href);
            
            listItems.push({ title, url: href, category: 'Culture' });
        });
        
        console.log(`[SoraNews24] List items found: ${listItems.length}`);
        
        console.log(`[SoraNews24] Total list items found: ${listItems.length}`);
        
        const detailedItems = [];
        for (const item of listItems.slice(0, 10)) { // 최대 10개만 상세 조회
            try {
                console.log(`[SoraNews24] Fetching details: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.url, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://soranews24.com/'
                    }
                });
                const $detail = cheerio.load(detailData);
                
                const content = $detail('.entry-content').html();
                const metaImage = $detail('meta[property="og:image"]').attr('content');
                const imageUrl = metaImage || '';
                
                const summary = content ? 
                    $detail('.entry-content').text().trim().substring(0, 300) : 
                    item.title;
                
                detailedItems.push({
                    title: item.title,
                    summary: summary,
                    content: content ? content.trim() : null,
                    originalUrl: item.url,
                    imageUrl: imageUrl,
                    source: 'SoraNews24',
                    category: item.category,
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
                
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`[SoraNews24] Detail error for ${item.url}:`, e.message);
                // 에러가 나도 기본 정보는 저장
                detailedItems.push({
                    title: item.title,
                    summary: item.title,
                    content: null,
                    originalUrl: item.url,
                    imageUrl: null,
                    source: 'SoraNews24',
                    category: item.category,
                    publishedAt: new Date(),
                    status: 'DRAFT'
                });
            }
        }
        
        console.log(`[SoraNews24] Final items: ${detailedItems.length}`);
        return detailedItems;
    } catch (e) {
        console.error('[SoraNews24] Crawl error:', e.message);
        return [];
    }
}

module.exports = crawlSoraNews24;

