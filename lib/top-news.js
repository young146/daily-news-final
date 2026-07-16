import prisma from "@/lib/prisma";

// WordPress 메타 필드 업데이트를 위한 범용 헬퍼 함수
export async function updateWordPressPostMeta(wordpressUrl, metaData) {
  try {
    console.log(`[WP Meta] 🔄 WordPress 업데이트 시작: ${wordpressUrl}`, metaData);

    const WP_URL = process.env.WORDPRESS_URL || "https://chaovietnam.co.kr";
    const WP_USER = process.env.WORDPRESS_USERNAME || "chaovietnam";
    const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

    if (!WP_PASSWORD) {
      throw new Error("WordPress App Password is not configured");
    }

    const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");

    let postId = null;
    let slug = null;

    try {
      const urlObj = new URL(wordpressUrl);
      console.log(`[WP Meta] 📍 URL 파싱: pathname=${urlObj.pathname}, search=${urlObj.search}`);

      // 1. ?p=123 형식인 경우
      if (urlObj.searchParams.has('p')) {
        postId = parseInt(urlObj.searchParams.get('p'));
        console.log(`[WP Meta] ✅ Post ID 직접 추출: ${postId}`);
      } else {
        // 2. URL 경로에서 추출
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const lastPart = pathParts[pathParts.length - 1];

        // 중요: 경로 마지막 부분이 숫자라면 바로 Post ID로 간주 (현재 사이트 구조 대응)
        if (lastPart && /^\d+$/.test(lastPart)) {
          postId = parseInt(lastPart);
          console.log(`[WP Meta] ✅ URL에서 Post ID 추출 성공: ${postId}`);
        } else {
          slug = lastPart || pathParts[pathParts.length - 2];
          console.log(`[WP Meta] 📝 Slug 추출: ${slug} (from pathParts: ${JSON.stringify(pathParts)})`);
        }
      }
    } catch (e) {
      console.error(`[WP Meta] ❌ WordPress URL 파싱 실패: ${wordpressUrl}`, e);
      return;
    }

    if (!postId && !slug) {
      console.error(`[WP Meta] ❌ WordPress URL에서 post ID나 slug를 추출할 수 없습니다: ${wordpressUrl}`);
      return;
    }

    // Post ID가 없으면 slug로 찾기
    if (!postId) {
      const searchUrl = `${WP_URL}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1`;
      console.log(`[WP Meta] 🔍 WordPress post 검색 중: ${searchUrl}`);

      const searchResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text().catch(() => '');
        console.error(`[WP Meta] ❌ WordPress post 검색 실패: ${searchResponse.status}`, errorText);
        throw new Error(`WordPress post 검색 실패: ${searchResponse.status}`);
      }

      const posts = await searchResponse.json();
      console.log(`[WP Meta] 📋 검색 결과: ${posts.length}개 post 발견`);

      if (!posts || posts.length === 0) {
        console.error(`[WP Meta] ❌ WordPress에서 post를 찾을 수 없습니다 (slug: ${slug})`);
        return;
      }

      postId = posts[0].id;
      console.log(`[WP Meta] ✅ Post ID 찾음: ${postId}`);
    }

    // 메타 필드 업데이트 (WordPress REST API v2 표준 방식)
    const updateUrl = `${WP_URL}/wp-json/wp/v2/posts/${postId}`;

    // 워드프레스가 가장 선호하는 표준 객체 구조로 전달
    const updateBody = {
      meta: {
        ...metaData
      }
    };

    console.log(`[WP Meta] 📤 워드프레스 표준 통로로 배달 중: ${updateUrl}`, JSON.stringify(updateBody));

    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateBody),
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json().catch(() => ({}));
      console.error(`[WP Meta] ❌ 배달 사고(업데이트 실패): ${updateResponse.status}`, errorData);
    } else {
      console.log(`[WP Meta] ✅ 배달 완료(업데이트 성공)! (Post ID: ${postId})`);
    }
  } catch (error) {
    console.warn(`[WP Meta] WordPress 업데이트 실패 (무시됨): ${error.message}`);
  }
}

// 베트남(UTC+7) 기준 '오늘 00:00'. 카드뉴스/발행목록 조회와 동일한 기준.
function getVNTodayStart() {
  const now = new Date();
  const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  return new Date(`${vnDateStr}T00:00:00+07:00`);
}

/**
 * 탑뉴스는 "그날의 가장 최신 1건"이 원칙이다.
 * 새 뉴스를 탑뉴스로 지정할 때, 같은 날의 더 오래된 탑뉴스를 DB와 WordPress 양쪽에서 해제한다.
 * (WordPress 플러그인이 is_top_news 메타로 ★TOP 배지를 그리므로 메타도 함께 내려야 한다.)
 *
 * ⚠️ 해제 범위를 '오늘'로 한정하는 이유:
 * 카드뉴스/발행목록/이메일 모두 publishedAt >= 오늘 로만 탑뉴스를 조회하므로 유일성은 하루 단위로만
 * 의미가 있다. 반면 과거 탑뉴스는 DB에 수백 건 누적돼 있어(해제된 적 없음), 전체 기간을 훑으면
 * 그만큼 WordPress API를 호출해 발행 요청이 통째로 타임아웃된다.
 *
 * @param {string} exceptId - 이번에 탑뉴스로 지정된 항목 id (해제 대상에서 제외)
 * @param {Date} publishedAt - 기준 시각. 오늘 범위 내에서 이보다 오래된 탑뉴스만 해제한다.
 * @returns {Promise<number>} 해제된 건수
 */
export async function demoteOlderTopNews(exceptId, publishedAt) {
  if (!publishedAt) return 0;

  const olderTopNews = await prisma.newsItem.findMany({
    where: {
      isTopNews: true,
      status: "PUBLISHED",
      id: { not: exceptId },
      publishedAt: { gte: getVNTodayStart(), lt: publishedAt },
    },
  });

  for (const old of olderTopNews) {
    await prisma.newsItem.update({
      where: { id: old.id },
      data: { isTopNews: false },
    });
    if (old.wordpressUrl) {
      await updateWordPressPostMeta(old.wordpressUrl, { is_top_news: "0" });
    }
    console.log(`[TopNews] 🔄 이전 탑뉴스 자동 해제: ${old.translatedTitle || old.title}`);
  }

  return olderTopNews.length;
}
