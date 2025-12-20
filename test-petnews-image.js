/**
 * PetNews 이미지 추출 테스트
 */

const axios = require('axios');
const cheerio = require('cheerio');

async function testPetNewsImageExtraction() {
    console.log('🧪 PetNews 이미지 추출 테스트 시작...\n');
    
    // The Dodo 샘플 URL (실제 기사 URL)
    const testUrls = [
        'https://www.thedodo.com/',
        'https://www.thedodo.com/news'
    ];
    
    try {
        // 먼저 메인 페이지에서 기사 링크 찾기
        const { data } = await axios.get('https://www.thedodo.com/', {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        
        const $ = cheerio.load(data);
        const articleLinks = [];
        const seen = new Set();
        
        // 기사 링크 찾기
        $('a[href]').each((index, element) => {
            if (articleLinks.length >= 5) return;
            
            let href = $(element).attr('href') || '';
            let title = $(element).text().trim();
            
            if (href.startsWith('/')) {
                href = `https://www.thedodo.com${href}`;
            } else if (!href.startsWith('http')) {
                return;
            }
            
            if (!href.includes('thedodo.com')) return;
            if (!title || title.length < 20 || title.length > 200) return;
            if (href.includes('/tag/') || href.includes('/author/') || href.includes('/category/')) return;
            if (seen.has(href)) return;
            
            const isArticleUrl = href.match(/\/[a-z0-9-]+\/?$/) && !href.includes('/tag/') && !href.includes('/author/');
            if (!isArticleUrl) return;
            
            seen.add(href);
            articleLinks.push({ title, url: href });
        });
        
        console.log(`✅ ${articleLinks.length}개 기사 링크 발견\n`);
        
        // 각 기사에서 이미지 추출 테스트
        for (let i = 0; i < Math.min(3, articleLinks.length); i++) {
            const article = articleLinks[i];
            console.log(`\n[${i + 1}] ${article.title}`);
            console.log(`   URL: ${article.url}`);
            
            try {
                const { data: detailData } = await axios.get(article.url, {
                    timeout: 20000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                
                const $detail = cheerio.load(detailData);
                
                // 현재 크롤러 로직대로 이미지 추출
                let metaImage = $detail('meta[property="og:image"]').attr('content');
                console.log(`   og:image: ${metaImage || '없음'}`);
                
                if (!metaImage) {
                    metaImage = $detail('meta[name="twitter:image"]').attr('content');
                    console.log(`   twitter:image: ${metaImage || '없음'}`);
                }
                
                if (!metaImage) {
                    const firstImg = $detail('article img, .article-content img, .post-content img').first();
                    metaImage = firstImg.attr('src') || firstImg.attr('data-src');
                    console.log(`   article img (src): ${firstImg.attr('src') || '없음'}`);
                    console.log(`   article img (data-src): ${firstImg.attr('data-src') || '없음'}`);
                }
                
                // 추가 확인: 다른 lazy loading 속성들
                if (!metaImage) {
                    const allImgs = $detail('article img, .article-content img, .post-content img, main img');
                    console.log(`   총 이미지 개수: ${allImgs.length}`);
                    
                    allImgs.each((idx, img) => {
                        const $img = $detail(img);
                        const src = $img.attr('src');
                        const dataSrc = $img.attr('data-src');
                        const dataLazySrc = $img.attr('data-lazy-src');
                        const dataOriginal = $img.attr('data-original');
                        const dataUrl = $img.attr('data-url');
                        
                        if (src || dataSrc || dataLazySrc || dataOriginal || dataUrl) {
                            console.log(`   이미지 [${idx}]:`);
                            if (src) console.log(`      src: ${src}`);
                            if (dataSrc) console.log(`      data-src: ${dataSrc}`);
                            if (dataLazySrc) console.log(`      data-lazy-src: ${dataLazySrc}`);
                            if (dataOriginal) console.log(`      data-original: ${dataOriginal}`);
                            if (dataUrl) console.log(`      data-url: ${dataUrl}`);
                        }
                    });
                }
                
                // 상대 경로 변환
                if (metaImage && metaImage.startsWith('/')) {
                    metaImage = `https://www.thedodo.com${metaImage}`;
                } else if (metaImage && !metaImage.startsWith('http')) {
                    metaImage = `https://www.thedodo.com/${metaImage}`;
                }
                
                console.log(`   ✅ 최종 이미지 URL: ${metaImage || '❌ 없음'}`);
                
                // 이미지가 실제로 로드되는지 확인
                if (metaImage) {
                    try {
                        const imgResponse = await axios.head(metaImage, { timeout: 5000 });
                        console.log(`   ✅ 이미지 접근 가능 (${imgResponse.status})`);
                    } catch (imgErr) {
                        console.log(`   ⚠️ 이미지 접근 실패: ${imgErr.message}`);
                    }
                }
                
            } catch (err) {
                console.error(`   ❌ 에러: ${err.message}`);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }
        
    } catch (error) {
        console.error('❌ 테스트 실패:', error.message);
    }
}

testPetNewsImageExtraction();

