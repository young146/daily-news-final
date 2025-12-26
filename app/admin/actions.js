"use server";

import prisma from "@/lib/prisma";
import { translateNewsItem, translateText } from "@/lib/translator";
import { publishToMainSite } from "@/lib/publisher";
import { postToSNS } from "@/lib/sns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function translateItemAction(id) {
  try {
    const item = await prisma.newsItem.findUnique({ where: { id } });
    if (!item) throw new Error("Item not found");

    const { translatedTitle, translatedSummary, translatedContent } =
      await translateNewsItem(
        item.title,
        item.summary,
        item.content || item.summary
      );

    await prisma.newsItem.update({
      where: { id },
      data: {
        translatedTitle,
        translatedSummary,
        translatedContent,
        translationStatus: "DRAFT",
        status: "TRANSLATED",
      },
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Translation failed:", error);
    return { success: false, error: error.message };
  }
}

export async function publishItemAction(id, target) {
  // target: 'main', 'daily', 'sns'
  try {
    const item = await prisma.newsItem.findUnique({ where: { id } });
    if (!item) throw new Error("Item not found");

    const data = {};

    if (target === "main") {
      const result = await publishToMainSite(item);
      data.wordpressUrl = result.postUrl;
      if (result.imageUrl) {
        data.wordpressImageUrl = result.imageUrl;
      }
      if (result.mediaId) {
        data.wordpressMediaId = result.mediaId;
      }
      if (result.localImagePath) {
        data.localImagePath = result.localImagePath;
      }
      data.isPublishedMain = true;
      data.publishedAt = new Date();
      data.status = "PUBLISHED";
      // data.isCardNews = true; // ✅ 자동 지정 제거 (관리자가 수동 선택하도록)
      
      console.log(`[Publish] ✅ News published to main site`);
    } else if (target === "daily") {
      // Publish to Main Site only (no separate summary post needed)
      const result = await publishToMainSite(item);
      data.wordpressUrl = result.postUrl;
      if (result.imageUrl) {
        data.wordpressImageUrl = result.imageUrl;
      }
      if (result.mediaId) {
        data.wordpressMediaId = result.mediaId;
      }
      if (result.localImagePath) {
        data.localImagePath = result.localImagePath;
      }
      data.isPublishedMain = true;
      data.isPublishedDaily = true;
      data.publishedAt = new Date();
      data.status = "PUBLISHED";
      // data.isCardNews = true; // ✅ 자동 지정 제거 (관리자가 수동 선택하도록)
      
      console.log(`[Publish] ✅ News published to daily summary`);
    } else if (target === "sns") {
      await postToSNS(item, "facebook");
      await postToSNS(item, "kakao");
      data.isSentSNS = true;
    }

    await prisma.newsItem.update({
      where: { id },
      data: {
        ...data,
        isSelected: false,
      },
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Publishing failed:", error);
    return { success: false, error: error.message };
  }
}

export async function updateCategoryAction(id, category) {
  try {
    const item = await prisma.newsItem.update({
      where: { id },
      data: { category },
    });
    
    // ✅ 발행된 뉴스인 경우 WordPress 메타도 함께 업데이트
    if (item.wordpressUrl) {
      await updateWordPressPostMeta(item.wordpressUrl, { news_category: category });
    }
    
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/admin/card-news");
    return { success: true };
  } catch (error) {
    console.error("Category update failed:", error);
    return { success: false, error: error.message };
  }
}

// WordPress 메타 필드 업데이트를 위한 범용 헬퍼 함수
async function updateWordPressPostMeta(wordpressUrl, metaData) {
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
    
    // 메타 필드 업데이트 (WordPress REST API v2)
    const updateUrl = `${WP_URL}/wp-json/wp/v2/posts/${postId}`;
    const updateBody = {
      meta: metaData
    };
    
    console.log(`[WP Meta] 📤 WordPress 메타 필드 업데이트 요청: ${updateUrl}`, updateBody);
    
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
      console.error(`[WP Meta] ❌ 업데이트 실패: ${updateResponse.status}`, errorData);
      
      // 대체 방법: 메타 엔드포인트 개별 업데이트 시도 (첫 번째 키만)
      const firstKey = Object.keys(metaData)[0];
      const metaUrl = `${WP_URL}/wp-json/wp/v2/posts/${postId}/meta/${firstKey}`;
      console.log(`[WP Meta] 🔄 메타 엔드포인트로 재시도: ${metaUrl}`);
      
      await fetch(metaUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: metaData[firstKey]
        }),
      });
    } else {
      console.log(`[WP Meta] ✅ WordPress 업데이트 성공 (Post ID: ${postId})`);
    }
  } catch (error) {
    console.warn(`[WP Meta] WordPress 업데이트 실패 (무시됨): ${error.message}`);
  }
}

// 발행된 뉴스용 탑뉴스 토글 (status 제한 없음)
export async function toggleTopNewsForPublishedAction(id) {
  try {
    const item = await prisma.newsItem.findUnique({ where: { id } });
    if (!item) {
      return { success: false, error: "뉴스를 찾을 수 없습니다." };
    }

    if (item.isTopNews) {
      // 탑뉴스 해제
      await prisma.newsItem.update({
        where: { id },
        data: { isTopNews: false },
      });

      // ✅ 동일한 제목을 가진 다른 중복 항목들도 모두 탑뉴스 해제 (중복 방지)
      if (item.title) {
        await prisma.newsItem.updateMany({
          where: { 
            title: item.title,
            isTopNews: true 
          },
          data: { isTopNews: false }
        });
      }
      
      // ✅ WordPress 메타 필드도 업데이트
      if (item.wordpressUrl) {
        await updateWordPressPostMeta(item.wordpressUrl, { is_top_news: '0' });
      }
      
      revalidatePath("/admin");
      revalidatePath("/admin/settings");
      revalidatePath("/admin/card-news");
      return { success: true, message: "탑뉴스가 해제되었습니다." };
    } else {
      // 탑뉴스 설정 시도 (오늘 날짜로 발행된 뉴스만 카운트)
      // 베트남 시간대(UTC+7) 기준으로 '오늘'의 시작과 끝을 정확하게 계산
      const now = new Date();
      const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // "YYYY-MM-DD"
      const today = new Date(`${vnDateStr}T00:00:00+07:00`);
      const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000);

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/f6fc14ce-ac4a-46f5-b5a7-c8a9162c4f22',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'H1',location:'app/admin/actions.js:toggleTopNewsForPublishedAction',message:'Computed VN day range',data:{start:today.toISOString(),end:endOfToday.toISOString()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
      // ✅ 트랜잭션을 사용하여 최신 데이터를 읽도록 보장
      const count = await prisma.$transaction(async (tx) => {
        return await tx.newsItem.count({
          where: {
            isTopNews: true,
            status: "PUBLISHED",
            publishedAt: { gte: today, lt: endOfToday }, // ✅ 오늘 날짜로 발행된 뉴스만 카운트
          },
        });
      });

      // 모든 탑뉴스 목록(오늘 범위) 확인 로그
      const allTopNewsToday = await prisma.newsItem.findMany({
        where: {
          isTopNews: true,
          status: "PUBLISHED",
          publishedAt: { gte: today, lt: endOfToday },
        },
        select: { id: true, publishedAt: true, title: true, translatedTitle: true },
        orderBy: { publishedAt: "asc" },
      });

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/f6fc14ce-ac4a-46f5-b5a7-c8a9162c4f22',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'H2',location:'app/admin/actions.js:toggleTopNewsForPublishedAction',message:'Current top news count',data:{count,rangeStart:today.toISOString(),rangeEnd:endOfToday.toISOString()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/f6fc14ce-ac4a-46f5-b5a7-c8a9162c4f22',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'H5',location:'app/admin/actions.js:toggleTopNewsForPublishedAction',message:'Top news list today',data:{items:allTopNewsToday},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      if (count >= 2) {
        // 현재 탑뉴스 목록 조회 (오늘 날짜로 발행된 것만)
        // ✅ 트랜잭션을 사용하여 최신 데이터를 읽도록 보장
        const currentTopNews = await prisma.$transaction(async (tx) => {
          return await tx.newsItem.findMany({
            where: {
              isTopNews: true,
              status: "PUBLISHED",
              publishedAt: { gte: today, lt: endOfToday }, // ✅ 오늘 날짜로 발행된 뉴스만
            },
            select: { translatedTitle: true, title: true, id: true, publishedAt: true },
            take: 2,
          });
        });

        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/f6fc14ce-ac4a-46f5-b5a7-c8a9162c4f22',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'H3',location:'app/admin/actions.js:toggleTopNewsForPublishedAction',message:'Top news blocked - current items',data:{items:currentTopNews},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        const topNewsTitles = currentTopNews
          .map((n) => `${n.translatedTitle || n.title} (${new Date(n.publishedAt).toLocaleDateString('ko-KR')})`)
          .join(", ");
        return {
          success: false,
          error: `탑뉴스는 최대 2개까지만 지정할 수 있습니다.\n\n현재 지정된 탑뉴스:\n${topNewsTitles}\n\n기존 탑뉴스를 해제한 후 다시 시도해주세요.`,
        };
      }

      await prisma.newsItem.update({
        where: { id },
        data: { isTopNews: true },
      });

      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/f6fc14ce-ac4a-46f5-b5a7-c8a9162c4f22',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'H2',location:'app/admin/actions.js:toggleTopNewsForPublishedAction',message:'Set top news success',data:{id,rangeStart:today.toISOString(),rangeEnd:endOfToday.toISOString()},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
      // ✅ WordPress 메타 필드도 업데이트
      if (item.wordpressUrl) {
        await updateWordPressPostMeta(item.wordpressUrl, { is_top_news: '1' });
      }
      
      revalidatePath("/admin");
      revalidatePath("/admin/settings");
      revalidatePath("/admin/card-news");
      return { success: true, message: "탑뉴스로 지정되었습니다." };
    }
  } catch (error) {
    console.error("Toggle top news failed:", error);
    return { success: false, error: `탑뉴스 지정 실패: ${error.message}` };
  }
}

export async function createDraftAndRedirectAction(formData) {
  const id = formData.get("id");
  const item = await prisma.newsItem.findUnique({ where: { id } });

  if (item) {
    // Perform auto-translation if not already done or if status is pending
    if (!item.translatedTitle || item.translationStatus === "PENDING") {
      try {
        const { translatedTitle, translatedSummary, translatedContent } =
          await translateNewsItem(
            item.title,
            item.summary,
            item.content || item.summary
          );

        await prisma.newsItem.update({
          where: { id },
          data: {
            translatedTitle,
            translatedSummary,
            translatedContent,
            translationStatus: "DRAFT",
          },
        });
      } catch (e) {
        console.error("Auto-translate failed on entry", e);
      }
    }
  }

  redirect(`/admin/news/${id}/translate`);
}

export async function toggleCardNewsAction(id) {
  try {
    const item = await prisma.newsItem.findUnique({ where: { id } });
    await prisma.newsItem.update({
      where: { id },
      data: { isCardNews: !item.isCardNews },
    });
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function batchTranslateAction(ids) {
  try {
    // Process in parallel to speed up and avoid timeouts
    // We use Promise.allSettled to ensure one failure doesn't stop the rest,
    // but for simplicity in this context, Promise.all is also okay if we want to fail fast.
    // However, handling individual errors inside the map is better.

    await Promise.all(
      ids.map(async (id) => {
        try {
          const item = await prisma.newsItem.findUnique({ where: { id } });
          // Translate if any part is missing or status is PENDING
          if (
            item &&
            (!item.translatedTitle ||
              !item.translatedSummary ||
              !item.translatedContent ||
              item.translationStatus === "PENDING")
          ) {
            const { translatedTitle, translatedSummary, translatedContent } =
              await translateNewsItem(
                item.title,
                item.summary,
                item.content || item.summary
              );

            await prisma.newsItem.update({
              where: { id },
              data: {
                translatedTitle,
                translatedSummary,
                translatedContent,
                translationStatus: "DRAFT",
              },
            });
          }
        } catch (e) {
          console.error(`Failed to translate item ${id}:`, e);
          // We continue with other items
        }
      })
    );

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Batch translate failed:", error);
    return { success: false, error: error.message };
  }
}

export async function batchTranslateTitlesAction(ids) {
  try {
    // Optimize: Run translations in parallel
    await Promise.all(
      ids.map(async (id) => {
        const item = await prisma.newsItem.findUnique({ where: { id } });
        if (item && !item.translatedTitle) {
          try {
            const translatedTitle = await translateText(item.title);
            await prisma.newsItem.update({
              where: { id },
              data: { translatedTitle },
            });
          } catch (e) {
            console.error(`Failed to translate title for item ${id}:`, e);
          }
        }
      })
    );
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Batch title translation failed:", error);
    return { success: false, error: error.message };
  }
}

export async function batchPublishDailyAction(ids) {
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  // Run sequentially to avoid overwhelming the WordPress server
  for (const id of ids) {
    try {
      const result = await publishItemAction(id, "daily");
      if (result.success) {
        successCount++;
      } else {
        failCount++;
        errors.push(`Item ${id}: ${result.error}`);
      }
    } catch (e) {
      failCount++;
      errors.push(`Item ${id}: ${e.message}`);
      console.error(`Failed to publish item ${id}:`, e);
    }
  }

  revalidatePath("/admin");
  return { success: failCount === 0, successCount, failCount, errors };
}

export async function batchDeleteAction(ids) {
  try {
    await prisma.newsItem.deleteMany({
      where: { id: { in: ids } },
    });
    revalidatePath("/admin");
    return { success: true, deletedCount: ids.length };
  } catch (error) {
    console.error("Batch delete failed:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteSelectedNewsAction(id) {
  try {
    await prisma.newsItem.delete({ where: { id } });
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Delete selected news failed:", error);
    return { success: false, error: error.message };
  }
}
