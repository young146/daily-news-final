/**
 * PetNews 본문 추출 테스트
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function testPetNewsContent() {
    console.log('🧪 PetNews 본문 추출 테스트 시작...\n');
    
    // 실제 The Dodo 기사 URL
    const testUrl = 'https://www.thedodo.com/daily-dodo/woman-opens-window-curtains-and-gets-a-free-show-from-a-bear-on-ice';
    
    try {
        console.log(`📄 테스트 URL: ${testUrl}\n`);
        
        const { data: detailData } = await axios.get(testUrl, {
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        
        const $detail = cheerio.load(detailData);
        
        console.log('🔍 본문 추출 시도...\n');
        
        // 현재 크롤러에서 사용하는 셀렉터들
        const contentSelectors = [
            '.article-content',
            '.post-content',
            '.entry-content',
            'article .content',
            '.article-body',
            '.story-content',
            '.post-body',
            'main article',
            '[role="article"]',
            'article',
            '.content',
            'main'
        ];
        
        let content = null;
        let foundSelector = null;
        
        for (const selector of contentSelectors) {
            const found = $detail(selector);
            if (found.length > 0) {
                const html = found.html();
                const text = found.text().trim();
                
                console.log(`  [${selector}]:`);
                console.log(`    요소 개수: ${found.length}`);
                console.log(`    HTML 길이: ${html ? html.length : 0} chars`);
                console.log(`    텍스트 길이: ${text.length} chars`);
                console.log(`    텍스트 미리보기: ${text.substring(0, 100)}...`);
                
                if (text && text.length > 100) {
                    content = html;
                    foundSelector = selector;
                    console.log(`    ✅ 충분한 내용 발견!`);
                    break;
                }
            } else {
                console.log(`  [${selector}]: 요소 없음`);
            }
        }
        
        if (!content) {
            console.log('\n⚠️ 본문을 찾을 수 없습니다. 페이지 구조 분석...\n');
            
            // 페이지의 주요 구조 요소 찾기
            console.log('📋 페이지 구조:');
            console.log(`  <article> 태그: ${$detail('article').length}개`);
            console.log(`  <main> 태그: ${$detail('main').length}개`);
            console.log(`  .content 클래스: ${$detail('.content').length}개`);
            console.log(`  .article 클래스: ${$detail('.article').length}개`);
            
            // 모든 가능한 본문 관련 클래스 찾기
            const allClasses = [];
            $detail('[class*="article"], [class*="content"], [class*="post"], [class*="story"], [class*="body"]').each((i, el) => {
                const classes = $detail(el).attr('class');
                if (classes) {
                    classes.split(' ').forEach(cls => {
                        if (cls && !allClasses.includes(cls)) {
                            allClasses.push(cls);
                        }
                    });
                }
            });
            
            console.log(`\n  발견된 관련 클래스 (최대 20개):`);
            allClasses.slice(0, 20).forEach(cls => {
                const count = $detail(`.${cls}`).length;
                const text = $detail(`.${cls}`).first().text().trim();
                console.log(`    .${cls}: ${count}개 요소, 첫 번째 텍스트 길이: ${text.length} chars`);
            });
        } else {
            console.log(`\n✅ 본문 추출 성공!`);
            console.log(`   사용된 셀렉터: ${foundSelector}`);
            console.log(`   본문 길이: ${content.length} chars`);
        }
        
    } catch (error) {
        console.error('❌ 테스트 실패:', error.message);
    }
}

testPetNewsContent();

