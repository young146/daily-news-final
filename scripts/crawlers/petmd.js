const axios = require('axios');
const cheerio = require('cheerio');
const { getVietnamTime } = require('../date-utils');

/**
 * PetMD 펫 건강 뉴스 크롤러
 */

async function crawlPetMD() {
    console.log('Starting crawl of PetMD (pet health news)...');
    const items = [];
    const seen = new Set();
    try {
        const urls = [
            'https://www.petmd.com/news',
            'https://www.petmd.com/dog/care',
            'https://www.petmd.com/cat/care'
        ];

        for (const url of urls) {
            try {
                console.log(`  Fetching: ${url}`);
                const { data } = await axios.get(url, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                const $ = cheerio.load(data);

                // 더 포괄적인 셀렉터 사용
                $('a[href]').each((index, element) => {
                    if (items.length >= 20) return;

                    let href = $(element).attr('href') || '';
                    let title = $(element).text().trim();

                    // 상대 경로를 절대 경로로 변환
                    if (href.startsWith('/')) {
                        href = `https://www.petmd.com${href}`;
                    } else if (!href.startsWith('http')) {
                        return;
                    }

                    // petmd.com 도메인 확인
                    if (!href.includes('petmd.com')) return;
                    
                    // 제목 필터링
                    if (!title || title.length < 15 || title.length > 200) return;
                    
                    // 제외할 URL 패턴
                    if (href.includes('/tag/') || 
                        href.includes('/author/') || 
                        href.includes('/category/') ||
                        href.includes('/search') ||
                        href.includes('/login') ||
                        href.includes('/register') ||
                        href === 'https://www.petmd.com/' ||
                        href === 'https://www.petmd.com') return;

                    // 중복 체크
                    if (seen.has(href)) return;
                    seen.add(href);

                    // 제목 정리
                    title = title.replace(/\s+/g, ' ').trim();

                    items.push({
                        title,
                        summary: '',
                        originalUrl: href,
                        imageUrl: '',
                        category: 'Pet',
                        source: 'PetMD',
                        publishedAt: getVietnamTime(),
                        status: 'DRAFT'
                    });
                });

                console.log(`  Found ${items.length} items from ${url}`);
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`PetMD error (${url}):`, e.message);
            }
        }

        const detailedItems = [];
        for (const item of items.slice(0, 10)) {
            try {
                console.log(`  Fetching details: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 20000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                const $detail = cheerio.load(detailData);

                // 더 많은 셀렉터로 기사 내용 찾기 (순차적으로 시도)
                const contentSelectors = [
                    '.article-body',
                    '.post-content',
                    '.content',
                    'article',
                    '.article-content',
                    '.post-body',
                    'main article',
                    '[role="article"]',
                    'main',
                    '.main-content'
                ];
                
                let content = null;
                for (const selector of contentSelectors) {
                    const found = $detail(selector);
                    if (found.length > 0) {
                        const html = found.html();
                        const text = found.text().trim();
                        // 텍스트가 충분히 긴 경우에만 사용
                        if (text && text.length > 100) {
                            content = html;
                            console.log(`  ✅ 본문 추출 성공 (셀렉터: ${selector}, 길이: ${text.length} chars)`);
                            break;
                        }
                    }
                }

                // 이미지 추출 (여러 소스 확인)
                let metaImage = $detail('meta[property="og:image"]').attr('content');
                if (!metaImage) {
                    metaImage = $detail('meta[name="twitter:image"]').attr('content');
                }
                if (!metaImage) {
                    metaImage = $detail('meta[property="og:image:secure_url"]').attr('content');
                }
                
                // 메타 태그에서 찾지 못한 경우 이미지 태그에서 찾기
                if (!metaImage) {
                    const imgSelectors = [
                        'article img',
                        '.article-body img',
                        '.content img',
                        '.article-content img',
                        '.post-content img',
                        'main article img',
                        '[role="article"] img'
                    ];
                    
                    for (const selector of imgSelectors) {
                        const imgs = $detail(selector);
                        if (imgs.length > 0) {
                            // 모든 lazy loading 속성 확인
                            imgs.each((idx, img) => {
                                if (metaImage) return; // 이미 찾았으면 중단
                                
                                const $img = $detail(img);
                                metaImage = $img.attr('src') || 
                                           $img.attr('data-src') || 
                                           $img.attr('data-lazy-src') || 
                                           $img.attr('data-original') || 
                                           $img.attr('data-url') ||
                                           $img.attr('data-lazy') ||
                                           $img.attr('data-srcset')?.split(' ')[0]; // srcset의 첫 번째 URL
                                
                                // background-image CSS 속성 확인
                                if (!metaImage) {
                                    const bgImage = $img.css('background-image');
                                    if (bgImage && bgImage !== 'none') {
                                        const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                                        if (match) metaImage = match[1];
                                    }
                                }
                                
                                if (metaImage) return false; // 찾았으면 루프 중단
                            });
                            
                            if (metaImage) break; // 찾았으면 셀렉터 루프 중단
                        }
                    }
                }
                
                // 상대 경로를 절대 경로로 변환
                if (metaImage) {
                    // URL 정리 (공백 제거, 인코딩 확인)
                    metaImage = metaImage.trim();
                    
                    if (metaImage.startsWith('//')) {
                        metaImage = `https:${metaImage}`;
                    } else if (metaImage.startsWith('/')) {
                        metaImage = `https://www.petmd.com${metaImage}`;
                    } else if (!metaImage.startsWith('http')) {
                        metaImage = `https://www.petmd.com/${metaImage}`;
                    }
                } else {
                    console.warn(`  ⚠️ 이미지를 찾을 수 없음: ${item.originalUrl}`);
                }
                
                const metaDesc = $detail('meta[property="og:description"]').attr('content') || 
                                $detail('meta[name="description"]').attr('content');

                if (metaImage) {
                    item.imageUrl = metaImage;
                    console.log(`  ✅ 이미지 추출 성공: ${metaImage.substring(0, 80)}...`);
                } else {
                    console.warn(`  ⚠️ 이미지 추출 실패: ${item.originalUrl}`);
                }
                if (metaDesc) item.summary = metaDesc;
                
                // 내용이 충분히 긴지 확인 (너무 짧으면 제외)
                if (content) {
                    const $content = cheerio.load(content);
                    const textContent = $content.text().trim();
                    if (textContent.length < 100) {
                        console.warn(`  Content too short (${textContent.length} chars) for ${item.originalUrl}`);
                        continue; // 내용이 너무 짧으면 건너뛰기
                    }
                    item.content = content.trim();
                } else {
                    console.warn(`  No content found for ${item.originalUrl}`);
                    continue; // 내용이 없으면 건너뛰기
                }

                detailedItems.push(item);
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`Error fetching PetMD details for ${item.originalUrl}:`, err.message);
                // 에러가 발생한 아이템은 건너뛰기
            }
        }

        console.log(`PetMD: ${detailedItems.length} items`);
        return detailedItems;
    } catch (error) {
        console.error('PetMD crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlPetMD;

