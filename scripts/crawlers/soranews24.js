const axios = require('axios');
const cheerio = require('cheerio');
const { getVietnamTime } = require('../date-utils');

async function crawlSoraNews24() {
    console.log('Starting crawl of SoraNews24 (펫/여행만)...');
    try {
        const categories = [
            { url: 'https://soranews24.com/category/animals/', category: 'Culture', name: 'Animals/Pets' },
            { url: 'https://soranews24.com/category/travel/', category: 'Culture', name: 'Travel' },
        ];

        const listItems = [];
        const seen = new Set();

        for (const cat of categories) {
            try {
                console.log(`Fetching ${cat.name}: ${cat.url}`);
                
                // 첫 페이지와 두 번째 페이지까지 크롤링 (더 많은 기사 수집)
                for (let page = 1; page <= 2; page++) {
                    const pageUrl = page === 1 ? cat.url : `${cat.url}page/${page}/`;
                    
                    try {
                        console.log(`  Fetching page ${page}: ${pageUrl}`);
                        const { data } = await axios.get(pageUrl, {
                            timeout: 20000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.9',
                                'Referer': 'https://soranews24.com/'
                            },
                            validateStatus: function (status) {
                                return status < 500; // 5xx 에러만 throw
                            }
                        });
                        
                        if (!data) {
                            console.warn(`  Page ${page}: No data received`);
                            break;
                        }
                        
                        const $ = cheerio.load(data);
                        console.log(`  Page ${page}: HTML loaded, length: ${data.length} chars`);

                        // 더 포괄적인 셀렉터 사용: 기사 링크를 찾기
                        const currentYear = new Date().getFullYear();
                        const lastYear = currentYear - 1;
                        const itemsBeforePage = listItems.length;
                        
                        // 먼저 기사 목록을 찾기 위한 다양한 셀렉터 시도
                        const articleSelectors = [
                            'article a',
                            '.entry-title a',
                            '.post-title a',
                            'h2.entry-title a',
                            'h3.entry-title a',
                            '.post a',
                            '.entry a',
                            'main a',
                            '.content a'
                        ];
                        
                        let foundLinks = new Set();
                        
                        // 각 셀렉터로 기사 링크 찾기
                        for (const selector of articleSelectors) {
                            $(selector).each((index, element) => {
                                if (listItems.length >= 30) return;
                                
                                let href = $(element).attr('href') || '';
                                let title = $(element).text().trim() || $(element).find('span').text().trim();
                                
                                if (!href || !title) return;
                                
                                // 상대 경로를 절대 경로로 변환
                                if (href.startsWith('/')) {
                                    href = `https://soranews24.com${href}`;
                                } else if (!href.startsWith('http')) {
                                    return;
                                }
                                
                                // soranews24.com 도메인 확인
                                if (!href.includes('soranews24.com')) return;
                                
                                // 제목 필터링 (너무 짧거나 길면 제외)
                                title = title.replace(/\s+/g, ' ').trim();
                                if (title.length < 10 || title.length > 200) return;
                                
                                // 제외할 URL 패턴
                                if (href.includes('/category/') && !href.match(/\/\d{4}\//)) return; // 카테고리 페이지 (년도 없는 경우)
                                if (href.includes('/tag/')) return;
                                if (href.includes('/author/')) return;
                                if (href.includes('/page/')) return;
                                if (href.includes('/search')) return;
                                if (href.endsWith('/category/animals/') || href.endsWith('/category/travel/')) return;
                                
                                // 기사 URL 패턴 확인 (년도 포함 또는 숫자로 끝나는 URL)
                                const isArticleUrl = href.match(/\/\d{4}\//) || // 년도 포함
                                                    href.match(/\/\d{4}\/\d{2}\//) || // 년도/월 포함
                                                    href.match(/\/\d+\/?$/) || // 숫자로 끝남
                                                    href.match(/\/[a-z0-9-]+\/?$/); // 슬래시로 끝나는 기사 URL
                                
                                if (!isArticleUrl) return;
                                
                                // 중복 체크
                                if (seen.has(href) || foundLinks.has(href)) return;
                                foundLinks.add(href);
                                seen.add(href);
                                
                                listItems.push({
                                    title,
                                    summary: '',
                                    originalUrl: href,
                                    imageUrl: '',
                                    category: cat.category,
                                    source: 'SoraNews24',
                                    publishedAt: getVietnamTime(),
                                    status: 'DRAFT'
                                });
                            });
                            
                            if (listItems.length > itemsBeforePage) {
                                console.log(`  Page ${page}: Found items using selector: ${selector}`);
                                break; // 셀렉터가 작동하면 중단
                            }
                        }
                        
                        // 셀렉터로 찾지 못한 경우, 모든 링크를 확인 (더 느슨한 필터링)
                        if (listItems.length === itemsBeforePage) {
                            console.log(`  Page ${page}: Trying fallback method - checking all links`);
                            $('a[href]').each((index, element) => {
                                if (listItems.length >= 30) return;
                                
                                let href = $(element).attr('href') || '';
                                let title = $(element).text().trim();
                                
                                // 상대 경로를 절대 경로로 변환
                                if (href.startsWith('/')) {
                                    href = `https://soranews24.com${href}`;
                                } else if (!href.startsWith('http')) {
                                    return;
                                }
                                
                                // soranews24.com 도메인 확인
                                if (!href.includes('soranews24.com')) return;
                                
                                // 제목 필터링
                                title = title.replace(/\s+/g, ' ').trim();
                                if (!title || title.length < 10 || title.length > 200) return;
                                
                                // 제외할 URL 패턴
                                if (href.includes('/tag/') || 
                                    href.includes('/author/') || 
                                    href.includes('/page/') ||
                                    href.includes('/search') ||
                                    href.endsWith('/category/animals/') ||
                                    href.endsWith('/category/travel/') ||
                                    href === 'https://soranews24.com/' ||
                                    href === 'https://soranews24.com') return;
                                
                                // 기사 URL인지 확인 (년도 포함 또는 적절한 패턴)
                                const hasYear = href.match(/\/\d{4}\//);
                                const hasArticlePattern = href.match(/\/\d{4}\/\d{2}\//) || 
                                                         href.match(/\/[a-z0-9-]{10,}\/?$/);
                                
                                // 카테고리 페이지는 제외하되, 년도가 포함된 경우는 허용
                                if (href.includes('/category/') && !hasYear) return;
                                
                                // 중복 체크
                                if (seen.has(href)) return;
                                seen.add(href);
                                
                                listItems.push({
                                    title,
                                    summary: '',
                                    originalUrl: href,
                                    imageUrl: '',
                                    category: cat.category,
                                    source: 'SoraNews24',
                                    publishedAt: getVietnamTime(),
                                    status: 'DRAFT'
                                });
                            });
                        }
                        
                        const foundInPage = listItems.length - itemsBeforePage;
                        
                        if (foundInPage > 0) {
                            console.log(`  Page ${page}: Found ${foundInPage} items`);
                            // 처음 3개 아이템의 URL 로그
                            listItems.slice(itemsBeforePage, itemsBeforePage + Math.min(3, foundInPage)).forEach((item, idx) => {
                                console.log(`    [${idx + 1}] ${item.title.substring(0, 50)}... -> ${item.originalUrl}`);
                            });
                        } else {
                            console.warn(`  Page ${page}: No items found. Total links checked: ${$('a[href]').length}`);
                        }
                        await new Promise(r => setTimeout(r, 500));
                    } catch (pageError) {
                        console.error(`  Page ${page} error:`, pageError.message);
                        if (page === 1) {
                            // 첫 페이지 에러는 로그만 남기고 계속 진행
                            console.warn(`  First page failed, but continuing...`);
                            break;
                        }
                        console.log(`  Page ${page} not available, skipping...`);
                        break; // 다음 페이지가 없으면 중단
                    }
                }

                await new Promise(r => setTimeout(r, 300));
            } catch (e) {
                console.error(`SoraNews24 category error (${cat.name}):`, e.message);
                console.error(`  Stack:`, e.stack?.split('\n').slice(0, 3).join('\n'));
                // 카테고리 에러는 로그만 남기고 계속 진행
            }
        }

        console.log(`SoraNews24 list items found: ${listItems.length}`);
        
        if (listItems.length === 0) {
            console.warn('⚠️ SoraNews24: No items found. Check selectors and URL structure.');
        }

        const detailedItems = [];
        for (const item of listItems) {
            try {
                console.log(`Fetching details for: ${item.title.substring(0, 50)}...`);
                const { data: detailData } = await axios.get(item.originalUrl, {
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                const $detail = cheerio.load(detailData);

                let content = $detail('.entry-content, .post-content, .article-body').html();

                const metaImage = $detail('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    item.imageUrl = metaImage;
                }

                if (content) {
                    item.content = content.trim();
                    const textContent = $detail('.entry-content').text().trim();
                    item.summary = textContent.substring(0, 300);
                }

                detailedItems.push(item);
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`Error fetching details for ${item.originalUrl}:`, err.message);
                detailedItems.push(item);
            }
        }

        console.log(`SoraNews24: ${detailedItems.length} items with details`);
        return detailedItems;
    } catch (error) {
        console.error('Error crawling SoraNews24:', error.message);
        console.error('Error stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
        // 에러가 발생해도 빈 배열 반환하여 크롤러가 중단되지 않도록 함
        return [];
    }
}

module.exports = crawlSoraNews24;
