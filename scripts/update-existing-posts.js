const https = require('https');
const crypto = require('crypto');

const WP_URL = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
const WP_USER = process.env.WORDPRESS_USERNAME || 'chaovietnam';
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

function getWPAuth() {
  if (!WP_PASSWORD) throw new Error('WordPress App Password is not configured');
  return Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
}

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (i === retries) throw new Error(`HTTP ${response.status}`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function updateExistingPosts() {
  console.log('🔄 기존 기사 업데이트 시작...');
  
  try {
    const auth = getWPAuth();
    const categoryId = 31; // 데일리뉴스 카테고리
    
    // 카테고리 31의 모든 포스트 가져오기
    let page = 1;
    let allPosts = [];
    let hasMore = true;
    
    while (hasMore) {
      console.log(`📄 페이지 ${page} 가져오는 중...`);
      const response = await fetchWithRetry(
        `${WP_URL}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        }
      );
      
      const posts = await response.json();
      if (posts.length === 0) {
        hasMore = false;
      } else {
        allPosts = allPosts.concat(posts);
        page++;
        if (posts.length < 100) hasMore = false;
      }
    }
    
    console.log(`📰 총 ${allPosts.length}개 기사 발견`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const post of allPosts) {
      try {
        let content = post.content.rendered || post.content || '';
        let needsUpdate = false;
        
        // 원문보기 링크 형식 변경
        // 기존: <div class="news-source-line">원문보기: <a href="URL">URL</a></div>
        // 변경: <div class="news-source-line"><a href="URL">원문보기</a></div>
        let newContent = content;
        
        // 패턴 1: <div class="news-source-line">원문보기: <a href="URL">URL</a></div>
        const pattern1 = /<div class="news-source-line">원문보기:\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a><\/div>/gi;
        newContent = newContent.replace(pattern1, (match, url, linkText) => {
          needsUpdate = true;
          return `<div class="news-source-line"><a href="${url}" target="_blank" rel="noopener noreferrer">원문보기</a></div>`;
        });
        
        // 패턴 2: 원문보기: <a href="URL">URL</a> (div 없이)
        const pattern2 = /원문보기:\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        newContent = newContent.replace(pattern2, (match, url, linkText) => {
          // URL이 링크 텍스트와 같은 경우만 변경
          if (url === linkText || linkText.includes('http') || linkText.length > 50) {
            needsUpdate = true;
            return `<div class="news-source-line"><a href="${url}" target="_blank" rel="noopener noreferrer">원문보기</a></div>`;
          }
          return match;
        });
        
        if (needsUpdate) {
          console.log(`✏️ 업데이트 중: ${post.title.rendered || post.title} (ID: ${post.id})`);
          
          const updateResponse = await fetchWithRetry(
            `${WP_URL}/wp-json/wp/v2/posts/${post.id}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                content: newContent,
              }),
            }
          );
          
          if (updateResponse.ok) {
            updatedCount++;
            console.log(`✅ 업데이트 완료: ${post.id}`);
          } else {
            const error = await updateResponse.text();
            console.error(`❌ 업데이트 실패 (ID: ${post.id}):`, error);
          }
          
          // API 부하 방지를 위한 딜레이
          await new Promise(r => setTimeout(r, 500));
        } else {
          skippedCount++;
        }
      } catch (e) {
        console.error(`❌ 에러 (ID: ${post.id}):`, e.message);
      }
    }
    
    console.log('\n📊 업데이트 완료:');
    console.log(`   - 업데이트됨: ${updatedCount}개`);
    console.log(`   - 변경 없음: ${skippedCount}개`);
    console.log(`   - 총 처리: ${allPosts.length}개`);
    
  } catch (error) {
    console.error('❌ 업데이트 실패:', error.message);
    process.exit(1);
  }
}

updateExistingPosts();

