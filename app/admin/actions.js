"use server";

import prisma from "@/lib/prisma";
import { translateNewsItem, translateText } from "@/lib/translator";
import { publishToMainSite, deleteWordPressPost } from "@/lib/publisher";
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

    // 🛡️ 중복 발행 방지: 이미 발행된 경우 스킵
    if (item.wordpressUrl && (target === "main" || target === "daily")) {
      console.log(`[Publish] ⚠️ Already published, skipping: ${item.translatedTitle || item.title}`);
      console.log(`[Publish] Existing WordPress URL: ${item.wordpressUrl}`);
      return { success: true, skipped: true, message: "Already published" };
    }

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

// 최신 발행분의 모든 메타를 WordPress와 강제 동기화 (탑뉴스 + 카테고리)
export async function syncAllTopNewsAction() {
  try {
    console.log("[Sync] 🔄 최신 발행분 전체 동기화 시작...");
    
    // 1. 최신 발행 날짜 찾기
    const latestItem = await prisma.newsItem.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true }
    });
    
    if (!latestItem || !latestItem.publishedAt) {
      return { success: false, error: "발행된 뉴스가 없습니다." };
    }
    
    // 최신 발행일의 시작과 끝
    const latestDate = new Date(latestItem.publishedAt);
    const startOfDay = new Date(latestDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(latestDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    console.log(`[Sync] 📅 최신 발행일: ${latestDate.toISOString().split('T')[0]}`);
    
    // 2. 최신 발행일의 뉴스만 가져오기
    const latestNews = await prisma.newsItem.findMany({
      where: { 
        status: "PUBLISHED",
        publishedAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      orderBy: { publishedAt: "desc" }
    });
    
    console.log(`[Sync] 📊 최신 발행분 뉴스: ${latestNews.length}개`);
    
    // 3. 이전 발행분의 모든 탑뉴스 해제
    const olderTopNews = await prisma.newsItem.findMany({
      where: {
        status: "PUBLISHED",
        isTopNews: true,
        publishedAt: { lt: startOfDay }
      }
    });
    
    for (const old of olderTopNews) {
      await prisma.newsItem.update({ where: { id: old.id }, data: { isTopNews: false } });
      if (old.wordpressUrl) {
        await updateWordPressPostMeta(old.wordpressUrl, { is_top_news: '0' });
      }
      console.log(`[Sync] 🔻 이전 탑뉴스 해제: ${old.translatedTitle || old.title}`);
    }
    
    // 4. 최신 발행분 동기화 (탑뉴스 + 카테고리)
    let syncedCount = 0;
    let topNewsCount = 0;
    const categoryCounts = {};
    
    for (const item of latestNews) {
      if (!item.wordpressUrl) continue;
      
      // 메타 데이터 준비
      const metaData = {
        is_top_news: item.isTopNews ? '1' : '0',
        news_category: item.category || 'Society'
      };
      
      // WordPress 업데이트
      await updateWordPressPostMeta(item.wordpressUrl, metaData);
      
      syncedCount++;
      if (item.isTopNews) {
        topNewsCount++;
        console.log(`[Sync] ⭐ 탑뉴스: ${item.translatedTitle || item.title}`);
      }
      
      // 카테고리 카운트
      const cat = item.category || 'Society';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    
    console.log(`[Sync] ✅ 동기화 완료!`);
    console.log(`[Sync] 📊 총 ${syncedCount}개 뉴스 동기화, 탑뉴스 ${topNewsCount}개`);
    console.log(`[Sync] 📊 카테고리별:`, categoryCounts);

    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    return { 
      success: true, 
      message: `동기화 완료! ${syncedCount}개 뉴스 동기화됨 (탑뉴스 ${topNewsCount}개, 카테고리: ${JSON.stringify(categoryCounts)})` 
    };
  } catch (error) {
    console.error("[Sync] ❌ 동기화 실패:", error);
    return { success: false, error: error.message };
  }
}

// ✅ 탑뉴스 토글
// 새 탑뉴스 지정 시: 해당 뉴스보다 오래된 탑뉴스들만 해제 (같은 발행분은 유지)
export async function toggleTopNewsForPublishedAction(id) {
  try {
    const item = await prisma.newsItem.findUnique({ where: { id } });
    if (!item) return { success: false, error: "뉴스를 찾을 수 없습니다." };

    const newTopNewsStatus = !item.isTopNews;

    if (newTopNewsStatus && item.publishedAt) {
      // ✅ 탑뉴스 지정 시: 해당 뉴스보다 오래된 탑뉴스들 해제 (DB + WordPress)
      const olderTopNews = await prisma.newsItem.findMany({
        where: { 
          isTopNews: true, 
          status: "PUBLISHED", 
          id: { not: id },
          publishedAt: { lt: item.publishedAt } // 이 뉴스보다 오래된 것만
        }
      });
      
      for (const old of olderTopNews) {
        await prisma.newsItem.update({ where: { id: old.id }, data: { isTopNews: false } });
        if (old.wordpressUrl) {
          await updateWordPressPostMeta(old.wordpressUrl, { is_top_news: '0' });
        }
        console.log(`[TopNews] 🔄 이전 탑뉴스 자동 해제: ${old.translatedTitle || old.title}`);
      }
    }

    // DB 업데이트
    await prisma.newsItem.update({ 
      where: { id }, 
      data: { isTopNews: newTopNewsStatus } 
    });

    // WordPress 메타 업데이트
    if (item.wordpressUrl) {
      await updateWordPressPostMeta(item.wordpressUrl, { 
        is_top_news: newTopNewsStatus ? '1' : '0' 
      });
    }

    console.log(`[TopNews] ${newTopNewsStatus ? '✅ 지정' : '❌ 해제'}: ${item.translatedTitle || item.title}`);

    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    return { success: true };
  } catch (error) {
    console.error("Toggle top news failed:", error);
    return { success: false, error: error.message };
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
    // Process in parallel with batch size limit to avoid rate limits
    // 배치 크기 제한으로 rate limit 방지 및 성능 최적화
    const BATCH_SIZE = 10; // 동시에 10개씩 처리 (gpt-4o-mini는 rate limit이 높음)
    
    // 통계 추적
    let skippedCount = 0;
    let translatedCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      
      const results = await Promise.allSettled(
        batch.map(async (id) => {
          try {
            const item = await prisma.newsItem.findUnique({ where: { id } });
            
            // COMPLETED 상태는 무조건 스킵 (이미 완료된 번역)
            if (item?.translationStatus === "COMPLETED") {
              console.log(`[Skip] Already COMPLETED: ${item.title?.substring(0, 30)}...`);
              return { status: 'skipped', reason: 'COMPLETED' };
            }
            
            // DRAFT 상태이고 3개 필드가 모두 있으면 스킵 (이미 번역 완료)
            if (
              item?.translationStatus === "DRAFT" &&
              item.translatedTitle &&
              item.translatedSummary &&
              item.translatedContent
            ) {
              console.log(`[Skip] Already DRAFT with all fields: ${item.title?.substring(0, 30)}...`);
              return { status: 'skipped', reason: 'DRAFT_COMPLETE' };
            }
            
            // 번역 필요: PENDING 상태이거나, 필드 중 하나라도 비어있음
            if (item) {
              console.log(`[Translate] ${item.title?.substring(0, 30)}...`);
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
              console.log(`[Done] ${translatedTitle?.substring(0, 30)}...`);
              return { status: 'translated' };
            }
            return { status: 'skipped', reason: 'NOT_FOUND' };
          } catch (e) {
            console.error(`Failed to translate item ${id}:`, e);
            return { status: 'failed', error: e.message };
          }
        })
      );
      
      // 결과 집계
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          if (r.value.status === 'skipped') skippedCount++;
          else if (r.value.status === 'translated') translatedCount++;
          else if (r.value.status === 'failed') failedCount++;
        } else {
          failedCount++;
        }
      });
      
      // 배치 간 짧은 대기 (rate limit 방지)
      if (i + BATCH_SIZE < ids.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`[BatchTranslate] 완료 - 번역: ${translatedCount}, 스킵: ${skippedCount}, 실패: ${failedCount}`);
    
    revalidatePath("/admin");
    return { 
      success: true, 
      translatedCount, 
      skippedCount, 
      failedCount,
      message: `번역: ${translatedCount}개, 스킵(이미완료): ${skippedCount}개, 실패: ${failedCount}개`
    };
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

  // 🛡️ 중복 ID 제거
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length < ids.length) {
    console.warn(`[Publish] Duplicate IDs detected! ${ids.length} → ${uniqueIds.length} unique IDs`);
  }

  console.log(`[Publish] Processing ${uniqueIds.length} items sequentially...`);

  // Run sequentially to avoid overwhelming the WordPress server
  for (const id of uniqueIds) {
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

/**
 * 발행된 뉴스를 삭제합니다 (WordPress 포스트 + DB)
 * 안전장치: 번역이 완료된 뉴스는 삭제 불가
 */
export async function deletePublishedNewsAction(id) {
  try {
    const item = await prisma.newsItem.findUnique({ where: { id } });
    if (!item) {
      return { success: false, error: "뉴스를 찾을 수 없습니다." };
    }

    // WordPress 포스트 삭제 (휴지통으로 이동)
    let wpDeleted = false;
    if (item.wordpressUrl) {
      wpDeleted = await deleteWordPressPost(item.wordpressUrl);
      if (!wpDeleted) {
        console.warn(`[Delete] WordPress 삭제 실패했지만 DB는 삭제합니다: ${item.wordpressUrl}`);
      }
    }

    // DB에서 삭제
    await prisma.newsItem.delete({ where: { id } });

    revalidatePath("/admin");
    revalidatePath("/admin/published-news");
    
    return { 
      success: true, 
      message: wpDeleted 
        ? "WordPress 포스트와 데이터베이스에서 삭제되었습니다." 
        : "데이터베이스에서 삭제되었습니다. (WordPress 삭제 실패)" 
    };
  } catch (error) {
    console.error("Delete published news failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * 발행된 뉴스를 일괄 삭제합니다
 */
export async function batchDeletePublishedNewsAction(ids) {
  try {
    const results = [];
    
    for (const id of ids) {
      const result = await deletePublishedNewsAction(id);
      results.push({ id, ...result });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    revalidatePath("/admin");
    revalidatePath("/admin/published-news");

    return {
      success: true,
      message: `${successCount}개 삭제 완료${failCount > 0 ? `, ${failCount}개 실패` : ''}`,
      results
    };
  } catch (error) {
    console.error("Batch delete published news failed:", error);
    return { success: false, error: error.message };
  }
}
