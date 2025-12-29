const axios = require('axios');
const cheerio = require('cheerio');

async function testPage() {
    try {
        console.log('Testing VnExpress Kinh Te page structure...\n');
        const { data } = await axios.get('https://vnexpress.net/kinh-te', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 20000
        });
        
        const $ = cheerio.load(data);
        console.log('Page Title:', $('title').text());
        
        // 기존 VnExpress VN과 동일한 선택자 시도
        console.log('\n=== .item-news 선택자 ===');
        const items = [];
        $('.item-news, .list-news-subfolder .item-news').each((index, element) => {
            if (index >= 10) return false;
            
            const titleEl = $(element).find('.title-news a, .title_news a');
            const title = titleEl.text().trim();
            const url = titleEl.attr('href');
            const summary = $(element).find('.description a, .lead_news_site a').text().trim();
            const imageEl = $(element).find('img');
            const imageUrl = imageEl.attr('src') || imageEl.attr('data-src');
            
            if (title && url) {
                const fullUrl = url.startsWith('http') ? url : `https://vnexpress.net${url}`;
                items.push({
                    title: title.substring(0, 60),
                    url: fullUrl,
                    summary: summary.substring(0, 50),
                    imageUrl: imageUrl ? imageUrl.substring(0, 50) : 'N/A'
                });
            }
        });
        
        console.log(`Found ${items.length} items:\n`);
        items.forEach((item, i) => {
            console.log(`${i+1}. ${item.title}`);
            console.log(`   URL: ${item.url}`);
            console.log(`   Image: ${item.imageUrl}`);
            console.log('');
        });
        
        // 첫 번째 아이템의 상세 페이지 테스트
        if (items.length > 0) {
            console.log('=== Testing detail page ===');
            const testUrl = items[0].url;
            console.log(`Testing: ${testUrl}\n`);
            
            const { data: detailData } = await axios.get(testUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            const $detail = cheerio.load(detailData);
            
            // 본문 선택자
            const content = $detail('.fck_detail, .sidebar-1, .content-detail, article.fck_detail').html();
            console.log('Content found:', content ? 'Yes (' + content.length + ' chars)' : 'No');
            
            // 이미지 선택자
            const ogImage = $detail('meta[property="og:image"]').attr('content');
            const firstImg = $detail('.fck_detail img, article img').first().attr('src');
            console.log('OG Image:', ogImage || 'N/A');
            console.log('First Image:', firstImg || 'N/A');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
        }
    }
}

testPage();

