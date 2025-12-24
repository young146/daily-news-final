// API 직접 테스트
const axios = require('axios');

async function testAPI(source) {
    try {
        console.log(`\n=== Testing API: ${source} ===`);
        
        // 로컬 서버가 실행 중이어야 함 (http://localhost:3000)
        const response = await axios.post('http://localhost:3000/api/crawl-source', 
            { source },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000 // 60초 타임아웃
            }
        );
        
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
        if (response.data.success) {
            console.log(`✅ Success! Found ${response.data.count} items`);
        } else {
            console.log(`❌ Failed: ${response.data.error}`);
        }
        
    } catch (error) {
        console.error(`❌ Error:`, error.message);
        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
            console.error(`  Data:`, error.response.data);
        }
        if (error.code === 'ECONNREFUSED') {
            console.error('\n⚠️ 로컬 서버가 실행 중이지 않습니다!');
            console.error('   먼저 "npm run dev"를 실행하세요.');
        }
    }
}

async function main() {
    console.log('🔍 Testing crawl-source API...\n');
    console.log('⚠️ 로컬 서버가 실행 중이어야 합니다 (npm run dev)\n');
    
    await testAPI('vnexpress-travel');
    await new Promise(r => setTimeout(r, 2000));
    await testAPI('vnexpress-health');
}

main().catch(console.error);


