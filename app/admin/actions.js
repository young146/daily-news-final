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
      data.isCardNews = true; // ✅ 발행된 뉴스를 카드 엽서 후보로 표시
      
      console.log(`[Publish] ✅ Set isCardNews=true for published news`);
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
      data.isCardNews = true; // ✅ 발행된 뉴스를 카드 엽서 후보로 표시
      
      console.log(`[Publish] ✅ Set isCardNews=true for published news`);
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
    await prisma.newsItem.update({
      where: { id },
      data: { category },
    });
    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/admin/card-news");
    return { success: true };
  } catch (error) {
    console.error("Category update failed:", error);
    return { success: false, error: error.message };
  }
}

// WordPress 메타 필드 업데이트 헬퍼 함수
async function updateWordPressTopNewsMeta(wordpressUrl, isTopNews) {
  try {
    console.log(`[TopNews] 🔄 WordPress 메타 필드 업데이트 시작: ${wordpressUrl}, isTopNews: ${isTopNews}`);
    
    const WP_URL = process.env.WORDPRESS_URL || "https://chaovietnam.co.kr";
    const WP_USER = process.env.WORDPRESS_USERNAME || "chaovietnam";
    const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
    
    if (!WP_PASSWORD) {
      throw new Error("WordPress App Password is not configured");
    }
    
    const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");
    
    // WordPress URL에서 slug 추출
    // 예: https://chaovietnam.co.kr/뉴스/제목-slug/ -> slug 추출
    // 또는: https://chaovietnam.co.kr/?p=123 -> post ID 직접 사용
    let postId = null;
    let slug = null;
    
    try {
      const urlObj = new URL(wordpressUrl);
      console.log(`[TopNews] 📍 URL 파싱: pathname=${urlObj.pathname}, search=${urlObj.search}`);
      
      // ?p=123 형식인 경우
      if (urlObj.searchParams.has('p')) {
        postId = parseInt(urlObj.searchParams.get('p'));
        console.log(`[TopNews] ✅ Post ID 직접 추출: ${postId}`);
      } else {
        // URL 경로에서 slug 추출
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        slug = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
        console.log(`[TopNews] 📝 Slug 추출: ${slug} (from pathParts: ${JSON.stringify(pathParts)})`);
      }
    } catch (e) {
      console.error(`[TopNews] ❌ WordPress URL 파싱 실패: ${wordpressUrl}`, e);
      return;
    }
    
    if (!postId && !slug) {
      console.error(`[TopNews] ❌ WordPress URL에서 post ID나 slug를 추출할 수 없습니다: ${wordpressUrl}`);
      return;
    }
    
    // Post ID가 없으면 slug로 찾기
    if (!postId) {
      const searchUrl = `${WP_URL}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1`;
      console.log(`[TopNews] 🔍 WordPress post 검색 중: ${searchUrl}`);
      
      const searchResponse = await fetch(searchUrl, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
      
      if (!searchResponse.ok) {
        const errorText = await searchResponse.text().catch(() => '');
        console.error(`[TopNews] ❌ WordPress post 검색 실패: ${searchResponse.status}`, errorText);
        throw new Error(`WordPress post 검색 실패: ${searchResponse.status}`);
      }
      
      const posts = await searchResponse.json();
      console.log(`[TopNews] 📋 검색 결과: ${posts.length}개 post 발견`);
      
      if (!posts || posts.length === 0) {
        console.error(`[TopNews] ❌ WordPress에서 post를 찾을 수 없습니다 (slug: ${slug})`);
        return;
      }
      
      postId = posts[0].id;
      console.log(`[TopNews] ✅ Post ID 찾음: ${postId}`);
    }
    
    // 메타 필드 업데이트 (WordPress REST API v2)
    // 방법 1: posts 엔드포인트로 메타 필드 업데이트 시도
    const updateUrl = `${WP_URL}/wp-json/wp/v2/posts/${postId}`;
    const updateBody = {
      meta: {
        is_top_news: isTopNews ? '1' : '0'
      }
    };
    
    console.log(`[TopNews] 📤 WordPress 메타 필드 업데이트 요청: ${updateUrl}`, updateBody);
    
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
      const errorText = await updateResponse.text().catch(() => '');
      console.error(`[TopNews] ❌ posts 엔드포인트 업데이트 실패: ${updateResponse.status}`, errorData, errorText);
      
      // 방법 2: 실패하면 메타 엔드포인트로 직접 업데이트 시도
      const metaUrl = `${WP_URL}/wp-json/wp/v2/posts/${postId}/meta/is_top_news`;
      console.log(`[TopNews] 🔄 메타 엔드포인트로 재시도: ${metaUrl}`);
      
      const metaResponse = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: isTopNews ? '1' : '0'
        }),
      });
      
      if (!metaResponse.ok) {
        const metaErrorData = await metaResponse.json().catch(() => ({}));
        const metaErrorText = await metaResponse.text().catch(() => '');
        console.error(`[TopNews] ❌ 메타 엔드포인트 업데이트도 실패: ${metaResponse.status}`, metaErrorData, metaErrorText);
        throw new Error(`WordPress 메타 업데이트 실패: ${errorData.message || metaErrorData.message || updateResponse.status}`);
      }
      
      const metaResult = await metaResponse.json();
      console.log(`[TopNews] ✅ WordPress 메타 필드 업데이트 완료 (메타 엔드포인트 사용, Post ID: ${postId}, is_top_news: ${isTopNews ? '1' : '0'})`, metaResult);
    } else {
      const updateResult = await updateResponse.json();
      console.log(`[TopNews] ✅ WordPress 메타 필드 업데이트 완료 (Post ID: ${postId}, is_top_news: ${isTopNews ? '1' : '0'})`, updateResult);
      
      // 업데이트 후 실제 메타 필드 값 확인
      const verifyResponse = await fetch(`${WP_URL}/wp-json/wp/v2/posts/${postId}?context=edit`, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });
      
      if (verifyResponse.ok) {
        const verifyPost = await verifyResponse.json();
        const actualMeta = verifyPost.meta?.is_top_news;
        console.log(`[TopNews] 🔍 업데이트 후 메타 필드 확인: is_top_news = ${actualMeta} (예상: ${isTopNews ? '1' : '0'})`);
        
        if (String(actualMeta) !== String(isTopNews ? '1' : '0')) {
          console.warn(`[TopNews] ⚠️ 메타 필드 값이 예상과 다릅니다! 예상: ${isTopNews ? '1' : '0'}, 실제: ${actualMeta}`);
        }
      }
    }
  } catch (error) {
    console.warn(`[TopNews] WordPress 메타 업데이트 실패 (무시됨): ${error.message}`);
    // 에러가 발생해도 DB 업데이트는 성공했으므로 계속 진행
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
      
      // ✅ WordPress 메타 필드도 업데이트
      if (item.wordpressUrl) {
        await updateWordPressTopNewsMeta(item.wordpressUrl, false);
      }
      
      revalidatePath("/admin");
      revalidatePath("/admin/settings");
      revalidatePath("/admin/card-news");
      return { success: true, message: "탑뉴스가 해제되었습니다." };
    } else {
      // 탑뉴스 설정 시도 (발행 여부와 관계없이 가능)
      const count = await prisma.newsItem.count({
        where: {
          isTopNews: true,
          // status 제한 제거 - 발행된 뉴스도 포함하여 카운트
        },
      });

      if (count >= 2) {
        // 현재 탑뉴스 목록 조회
        const currentTopNews = await prisma.newsItem.findMany({
          where: {
            isTopNews: true,
          },
          select: { translatedTitle: true, title: true, id: true },
          take: 2,
        });

        const topNewsTitles = currentTopNews
          .map((n) => n.translatedTitle || n.title)
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
      
      // ✅ WordPress 메타 필드도 업데이트
      if (item.wordpressUrl) {
        await updateWordPressTopNewsMeta(item.wordpressUrl, true);
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
