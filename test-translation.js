/**
 * 번역 함수 테스트
 */

async function testTranslation() {
    console.log('🧪 번역 함수 테스트 시작...\n');
    
    try {
        // 동적 import로 번역 함수 가져오기
        const { translateTitle } = await import('./lib/translator.js');
        
        // 테스트 샘플 아이템
        const testItem = {
            title: "Vietnam's economy shows strong growth in Q4",
            summary: "Vietnam's economy continues to show strong growth indicators in the fourth quarter.",
            source: "VnExpress",
            category: "Economy"
        };
        
        console.log('📝 테스트 아이템:');
        console.log(`   제목: ${testItem.title}`);
        console.log(`   소스: ${testItem.source}`);
        console.log(`   카테고리: ${testItem.category}\n`);
        
        console.log('🔄 번역 시작...');
        const startTime = Date.now();
        
        const result = await translateTitle(testItem);
        
        const elapsed = Date.now() - startTime;
        
        console.log(`\n✅ 번역 완료 (${elapsed}ms)`);
        console.log(`   번역된 제목: ${result.translatedTitle || '❌ 없음'}`);
        console.log(`   카테고리: ${result.category || 'N/A'}`);
        
        if (result.error) {
            console.log(`   ⚠️ 에러: ${result.error}`);
        }
        
        if (!result.translatedTitle) {
            console.log('\n❌ 번역 실패! 번역된 제목이 없습니다.');
            console.log('   가능한 원인:');
            console.log('   1. OPENAI_API_KEY 환경 변수가 설정되지 않음');
            console.log('   2. OpenAI API 호출 실패');
            console.log('   3. 응답 파싱 실패');
        } else {
            console.log('\n✅ 번역 성공!');
        }
        
    } catch (error) {
        console.error('\n❌ 테스트 실패:', error.message);
        console.error('스택:', error.stack?.split('\n').slice(0, 5).join('\n'));
    }
}

testTranslation();

