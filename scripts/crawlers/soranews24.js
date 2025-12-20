const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const { getVietnamTime } = require('../date-utils');

async function crawlSoraNews24() {
    console.log('Starting crawl of SoraNews24 via RSS (펫/여행만)...');
    const parser = new Parser({
        customFields: {
            item: [
                ['content:encoded', 'contentEncoded'],
                ['media:content', 'mediaContent'],
                ['media:thumbnail', 'mediaThumbnail'],
            ]
        }
    });

    try {
        // RSS 피드 URL (WordPress 기본 형식)
        const rssFeeds = [
            { 
                url: 'https://soranews24.com/category/animals/feed/', 
                category: 'Culture', 
                name: 'Animals/Pets' 
            },
            { 
                url: 'https://soranews24.com/category/travel/feed/', 
                category: 'Culture', 
                name: 'Travel' 
            },
            // 전체 피드도 시도 (카테고리별이 안 되면)
            { 
                url: 'https://soranews24.com/feed/', 
                category: 'Culture', 
                name: 'All' 
            },
        ];

        const listItems = [];
        const seen = new Set();

        // RSS 피드에서 기사 수집
        for (const feed of rssFeeds) {
            try {
                console.log(`📡 Fetching RSS feed: ${feed.name} (${feed.url})`);
                
                const feedData = await parser.parseURL(feed.url);
                
                if (!feedData || !feedData.items || feedData.items.length === 0) {
                    console.warn(`  ⚠️ No items found in RSS feed: ${feed.url}`);
                    continue;
                }
                
                console.log(`  ✅ Found ${feedData.items.length} items in RSS feed`);
                
                // 카테고리 필터링 (전체 피드인 경우)
                const filteredItems = feed.url.includes('/feed/') && !feed.url.includes('/category/')
                    ? feedData.items.filter(item => {
                        // URL에서 카테고리 확인
                        const url = item.link || '';
                        return url.includes('/category/animals/') || url.includes('/category/travel/');
                    })
                    : feedData.items;
                
                for (const item of filteredItems) {
                    if (listItems.length >= 30) break; // 최대 30개로 제한
                    
                    const url = item.link || item.guid || '';
                    if (!url || seen.has(url)) continue;
                    
                    // URL 유효성 확인
                    if (!url.includes('soranews24.com')) continue;
                    
                    // 제목 필터링
                    const title = (item.title || '').trim();
                    if (!title || title.length < 10 || title.length > 200) continue;
                    
                    seen.add(url);
                    
                    // 발행 날짜 파싱
                    let publishedAt = getVietnamTime();
                    if (item.pubDate) {
                        try {
                            publishedAt = new Date(item.pubDate);
                            // 베트남 시간대 기준으로 변환
                            publishedAt = new Date(
                                publishedAt.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
                            );
                        } catch (e) {
                            console.warn(`  ⚠️ Failed to parse date for ${url}: ${e.message}`);
                        }
                    }
                    
                    // 이미지 URL 추출
                    let imageUrl = '';
                    if (item.contentEncoded) {
                        // content:encoded에서 이미지 추출
                        const $content = cheerio.load(item.contentEncoded);
                        const firstImg = $content('img').first().attr('src');
                        if (firstImg) imageUrl = firstImg;
                    }
                    if (!imageUrl && item.content) {
                        // content에서 이미지 추출
                        const imgMatch = item.content.match(/<img[^>]+src="([^"]+)"/i);
                        if (imgMatch) imageUrl = imgMatch[1];
                    }
                    if (!imageUrl && item.mediaThumbnail) {
                        imageUrl = item.mediaThumbnail.$.url || item.mediaThumbnail;
                    }
                    if (!imageUrl && item.mediaContent) {
                        imageUrl = item.mediaContent.$.url || item.mediaContent;
                    }
                    
                    // 요약 추출
                    let summary = '';
                    if (item.contentSnippet) {
                        summary = item.contentSnippet.substring(0, 300);
                    } else if (item.content) {
                        const $content = cheerio.load(item.content);
                        summary = $content.text().substring(0, 300);
                    } else if (item.description) {
                        const $desc = cheerio.load(item.description);
                        summary = $desc.text().substring(0, 300);
                    }
                    
                    listItems.push({
                        title,
                        summary: summary.trim(),
                        originalUrl: url,
                        imageUrl: imageUrl.trim(),
                        category: feed.category,
                        source: 'SoraNews24',
                        publishedAt: publishedAt,
                        status: 'DRAFT'
                    });
                }
                
                console.log(`  ✅ Added ${filteredItems.length} items from ${feed.name} RSS feed`);
                await new Promise(r => setTimeout(r, 500)); // 피드 간 딜레이
                
            } catch (e) {
                console.error(`  ❌ RSS feed error (${feed.name}):`, e.message);
                // RSS 피드 에러는 로그만 남기고 계속 진행
                continue;
            }
        }

        console.log(`SoraNews24: Total ${listItems.length} items found via RSS`);
        
        if (listItems.length === 0) {
            console.warn('⚠️ SoraNews24: No items found from RSS feeds. Check RSS feed URLs.');
            return [];
        }

        // RSS에서 이미 충분한 정보를 얻었지만, 본문 내용이 없는 경우에만 상세 페이지 크롤링
        const detailedItems = [];
        for (const item of listItems) {
            // RSS에서 본문이 없거나 불완전한 경우에만 상세 페이지 크롤링
            if (!item.summary || item.summary.length < 50) {
                try {
                    console.log(`  📄 Fetching full content for: ${item.title.substring(0, 50)}...`);
                    const { data: detailData } = await axios.get(item.originalUrl, {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });
                    const $detail = cheerio.load(detailData);

                    // 본문 추출
                    let content = $detail('.entry-content, .post-content, .article-body, .post').html();
                    if (!content) {
                        // 대체 셀렉터 시도
                        content = $detail('article').html() || $detail('.content').html();
                    }

                    // 이미지가 없으면 OG 이미지 시도
                    if (!item.imageUrl) {
                        const metaImage = $detail('meta[property="og:image"]').attr('content');
                        if (metaImage) {
                            item.imageUrl = metaImage;
                        }
                    }

                    if (content) {
                        item.content = content.trim();
                        const textContent = $detail('.entry-content, .post-content, article').text().trim();
                        if (textContent && (!item.summary || item.summary.length < 50)) {
                            item.summary = textContent.substring(0, 300);
                        }
                    }

                    await new Promise(r => setTimeout(r, 500));
                } catch (err) {
                    console.warn(`  ⚠️ Failed to fetch details for ${item.originalUrl}: ${err.message}`);
                    // 에러가 나도 RSS에서 얻은 정보는 유지
                }
            }
            
            detailedItems.push(item);
        }

        console.log(`✅ SoraNews24: ${detailedItems.length} items processed (RSS + details)`);
        return detailedItems;
    } catch (error) {
        console.error('Error crawling SoraNews24:', error.message);
        console.error('Error stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
        // 에러가 발생해도 빈 배열 반환하여 크롤러가 중단되지 않도록 함
        return [];
    }
}

module.exports = crawlSoraNews24;
