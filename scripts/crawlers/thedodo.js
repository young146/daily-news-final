const axios = require('axios');
const cheerio = require('cheerio');
const { getVietnamTime } = require('../date-utils');

/**
 * The Dodo 펫 뉴스 크롤러
 */

async function crawlTheDodo() {
    console.log('Starting crawl of The Dodo (pet news)...');
    const items = [];
    const seen = new Set();
    try {
        // The Dodo의 최신 뉴스 페이지
        const urls = [
            'https://www.thedodo.com/',
            'https://www.thedodo.com/news'
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

                // 기사 링크를 찾기 위한 더 정확한 셀렉터 시도
                const articleSelectors = [
                    'article a',
                    '.article-card a',
                    '.story-card a',
                    '.card a',
                    'h2 a',
                    'h3 a',
                    '.headline a',
                    '.title a'
                ];
                
                let foundWithSelector = false;
                
                // 먼저 기사 셀렉터로 찾기
                for (const selector of articleSelectors) {
                    $(selector).each((index, element) => {
                        if (items.length >= 15) return;

                        let href = $(element).attr('href') || '';
                        let title = $(element).text().trim() || $(element).find('span').text().trim();

                        // 상대 경로를 절대 경로로 변환
                        if (href.startsWith('/')) {
                            href = `https://www.thedodo.com${href}`;
                        } else if (!href.startsWith('http')) {
                            return;
                        }

                        // thedodo.com 도메인 확인
                        if (!href.includes('thedodo.com')) return;
                        
                        // 제목 필터링 (너무 짧거나 의미 없는 제목 제외)
                        title = title.replace(/\s+/g, ' ').trim();
                        if (!title || title.length < 20 || title.length > 200) return;
                        
                        // 의미 없는 제목 패턴 제외
                        if (title.toLowerCase().includes('view all') ||
                            title.toLowerCase().includes('see more') ||
                            title.toLowerCase().includes('read more') ||
                            title.toLowerCase().includes('click here') ||
                            title.match(/^\d+$/)) return;
                        
                        // 제외할 URL 패턴
                        if (href.includes('/tag/') || 
                            href.includes('/author/') || 
                            href.includes('/category/') ||
                            href.includes('/search') ||
                            href.includes('/about') ||
                            href.includes('/contact') ||
                            href.includes('/privacy') ||
                            href.includes('/terms') ||
                            href === 'https://www.thedodo.com/' ||
                            href === 'https://www.thedodo.com') return;
                        
                        // 기사 URL 패턴 확인 (숫자나 슬래시로 끝나는 URL)
                        const isArticleUrl = href.match(/\/[a-z0-9-]+\/?$/) && 
                                            !href.includes('/tag/') &&
                                            !href.includes('/author/');
                        
                        if (!isArticleUrl) return;

                        // 중복 체크
                        if (seen.has(href)) return;
                        seen.add(href);

                        items.push({
                            title,
                            summary: '',
                            originalUrl: href,
                            imageUrl: '',
                            category: 'Pet',
                            source: 'The Dodo',
                            publishedAt: getVietnamTime(),
                            status: 'DRAFT'
                        });
                        foundWithSelector = true;
                    });
                    
                    if (foundWithSelector && items.length > 0) break;
                }
                
                // 셀렉터로 찾지 못한 경우 fallback
                if (!foundWithSelector) {
                    console.log(`  Fallback: checking all links for ${url}`);
                    $('a[href]').each((index, element) => {
                        if (items.length >= 15) return;

                        let href = $(element).attr('href') || '';
                        let title = $(element).text().trim();

                        // 상대 경로를 절대 경로로 변환
                        if (href.startsWith('/')) {
                            href = `https://www.thedodo.com${href}`;
                        } else if (!href.startsWith('http')) {
                            return;
                        }

                        // thedodo.com 도메인 확인
                        if (!href.includes('thedodo.com')) return;
                        
                        // 제목 필터링
                        title = title.replace(/\s+/g, ' ').trim();
                        if (!title || title.length < 20 || title.length > 200) return;
                        
                        // 의미 없는 제목 제외
                        if (title.toLowerCase().includes('view all') ||
                            title.toLowerCase().includes('see more') ||
                            title.toLowerCase().includes('read more')) return;
                        
                        // 제외할 URL 패턴
                        if (href.includes('/tag/') || 
                            href.includes('/author/') || 
                            href.includes('/category/') ||
                            href.includes('/search') ||
                            href === 'https://www.thedodo.com/' ||
                            href === 'https://www.thedodo.com') return;

                        // 중복 체크
                        if (seen.has(href)) return;
                        seen.add(href);

                        items.push({
                            title,
                            summary: '',
                            originalUrl: href,
                            imageUrl: '',
                            category: 'Pet',
                            source: 'The Dodo',
                            publishedAt: getVietnamTime(),
                            status: 'DRAFT'
                        });
                    });
                }

                console.log(`  Found ${items.length} items from ${url}`);
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`The Dodo error (${url}):`, e.message);
            }
        }

        // 상세 정보 가져오기
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
                    '.article-content',
                    '.post-content',
                    '.entry-content',
                    'article .content',
                    '.article-body',
                    '.story-content',
                    '.post-body',
                    'main article',
                    '[role="article"]',
                    'article', // fallback
                    '.content', // fallback
                    'main' // fallback
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
                        '.article-content img',
                        '.post-content img',
                        '.entry-content img',
                        '.story-content img',
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
                        metaImage = `https://www.thedodo.com${metaImage}`;
                    } else if (!metaImage.startsWith('http')) {
                        metaImage = `https://www.thedodo.com/${metaImage}`;
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
                console.error(`Error fetching The Dodo details for ${item.originalUrl}:`, err.message);
                // 에러가 발생한 아이템은 건너뛰기 (내용 없는 아이템 저장 방지)
            }
        }

        console.log(`The Dodo: ${detailedItems.length} items`);
        return detailedItems;
    } catch (error) {
        console.error('The Dodo crawl failed:', error.message);
        return [];
    }
}

module.exports = crawlTheDodo;

