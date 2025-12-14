const crawlGoogleDiscovery = require('./crawlers/google-discovery');

async function test() {
    console.log('🧪 구글 디스커버리 모듈 단독 테스트 시작...');
    try {
        const results = await crawlGoogleDiscovery();
        console.log('\n================ 검증 결과 ================');
        console.log(`총 발견된 기사: ${results.length}개`);

        results.forEach((item, index) => {
            console.log(`\n[${index + 1}] 카테고리: ${item.category}`);
            console.log(`제목: ${item.title}`);
            console.log(`링크: ${item.originalUrl.substring(0, 50)}...`);
        });
        console.log('\n==========================================');
    } catch (error) {
        console.error('테스트 실패:', error);
    }
}

test();
