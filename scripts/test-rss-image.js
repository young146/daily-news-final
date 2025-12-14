const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');

async function testRSSImage() {
    console.log('🧪 구글 뉴스 RSS 사진 추출 테스트 중...');
    const parser = new Parser();

    // 예: 'Vietnam Travel' 검색
    const FEED_URL = 'https://news.google.com/rss/search?q=Vietnam+Travel+when:1d&hl=en-VN&gl=VN&ceid=VN:en';

    try {
        const feed = await parser.parseURL(FEED_URL);
        console.log(`\n총 ${feed.items.length}개의 기사 발견.\n`);

        // 첫 3개만 테스트
        for (let i = 0; i < 3; i++) {
            const item = feed.items[i];
            console.log(`[기사 ${i + 1}] ${item.title}`);
            console.log(`링크: ${item.link}`);

            // 1. RSS 자체에 이미지가 있는지 확인
            let imageUrl = null;
            if (item.content && item.content.match(/src="([^"]+)"/)) {
                // 구글 RSS는 종종 description 안에 img 태그를 숨겨놓음
                imageUrl = item.content.match(/src="([^"]+)"/)[1];
                console.log(`   - RSS 썸네일 발견: ${imageUrl.substring(0, 50)}...`);
            }

            // 2. 링크를 타고 가서 고화질(OG) 이미지 가져오기 시도
            try {
                // 구글 뉴스 링크는 리다이렉트가 있어서 실제 주소를 따라가야 함
                const response = await axios.get(item.link, {
                    maxRedirects: 5,
                    headers: { 'User-Agent': 'Mozilla/5.0' } // 봇 차단 방지
                });

                const $ = cheerio.load(response.data);
                const ogImage = $('meta[property="og:image"]').attr('content');

                if (ogImage) {
                    console.log(`   ✅ 고화질 대표 사진 확보 성공!: ${ogImage.substring(0, 60)}...`);
                } else {
                    console.log(`   ⚠️ 대표 사진 없음 (사이트 구조 문제)`);
                }
            } catch (e) {
                console.log(`   ❌ 사진 추출 실패: ${e.message}`);
            }
            console.log('------------------------------------------------');
        }
    } catch (error) {
        console.error('RSS 로드 실패:', error);
    }
}

testRSSImage();
