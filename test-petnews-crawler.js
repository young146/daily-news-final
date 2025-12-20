/**
 * PetNews 크롤러 전체 테스트
 */

const crawlPetNews = require('./scripts/crawlers/petnews');

async function testPetNewsCrawler() {
    console.log('🧪 PetNews 크롤러 전체 테스트 시작...\n');
    
    try {
        const items = await crawlPetNews();
        
        console.log(`\n✅ 크롤링 완료!`);
        console.log(`📊 총 ${items.length}개 아이템 수집\n`);
        
        if (items.length > 0) {
            console.log(`📰 수집된 기사 상세 정보:\n`);
            
            let imageCount = 0;
            let noImageCount = 0;
            
            items.forEach((item, idx) => {
                console.log(`[${idx + 1}] ${item.title}`);
                console.log(`   URL: ${item.originalUrl}`);
                console.log(`   소스: ${item.source}`);
                console.log(`   이미지: ${item.imageUrl ? '✅ 있음' : '❌ 없음'}`);
                
                if (item.imageUrl) {
                    console.log(`   이미지 URL: ${item.imageUrl.substring(0, 100)}${item.imageUrl.length > 100 ? '...' : ''}`);
                    imageCount++;
                } else {
                    noImageCount++;
                }
                
                console.log(`   요약 길이: ${item.summary?.length || 0} chars`);
                console.log(`   본문 길이: ${item.content?.length || 0} chars`);
                console.log(`   발행일: ${item.publishedAt}`);
                console.log('');
            });
            
            console.log(`\n📊 이미지 추출 통계:`);
            console.log(`   총 ${items.length}개 중 ${imageCount}개에 이미지 있음 (${Math.round(imageCount/items.length*100)}%)`);
            console.log(`   이미지 없음: ${noImageCount}개 (${Math.round(noImageCount/items.length*100)}%)`);
            
            if (noImageCount > 0) {
                console.log(`\n⚠️ 이미지가 없는 기사:`);
                items.forEach((item, idx) => {
                    if (!item.imageUrl) {
                        console.log(`   - [${idx + 1}] ${item.title}`);
                        console.log(`     ${item.originalUrl}`);
                    }
                });
            }
            
        } else {
            console.log(`\n⚠️ 수집된 아이템이 없습니다.`);
        }
        
    } catch (error) {
        console.error(`\n❌ 크롤러 에러:`, error.message);
        console.error(`스택:`, error.stack?.split('\n').slice(0, 10).join('\n'));
    }
}

testPetNewsCrawler();

