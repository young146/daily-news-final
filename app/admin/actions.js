"use server";

import prisma from "@/lib/prisma";
import { translateNewsItem, translateText } from "@/lib/translator";
import { publishToMainSite, deleteWordPressPost } from "@/lib/publisher";
import { postToSNS } from "@/lib/sns";
import { sendNewsletterWithFallback } from "@/lib/email-service";
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

/**
 * 이메일 구독자들에게 당일 발행된 뉴스레터를 수동으로 즉시 발송합니다.
 */
export async function sendDailyEmailAction(isTest = false, customEmail = null) {
  try {
    // 수신자 결정
    let targetEmails;
    if (customEmail) {
      // 특정 이메일로 직접 발송
      const email = customEmail.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, error: '유효한 이메일 주소를 입력하세요.' };
      }
      targetEmails = [email];
    } else if (isTest) {
      // 테스트 발송 (고정 주소)
      const testEmail = process.env.TEST_EMAIL || 'younghan146@gmail.com';
      targetEmails = [testEmail];
    } else {
      // 전체 구독자 발송
      const subscribers = await prisma.subscriber.findMany({
        where: { isActive: true },
        select: { email: true }
      });
      targetEmails = subscribers.map(s => (s.email || '').trim()).filter(e => e.length > 0);
      if (targetEmails.length === 0) {
        return { success: false, error: '활성 구독자가 없습니다.' };
      }
    }

    // 오늘 날짜 (베트남 시간)
    const now = new Date();
    const vnDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const today = new Date(`${vnDateStr}T00:00:00+07:00`);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const dateObj = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const weekday = weekdays[dateObj.getDay()];
    const todayString = `${year}년 ${month}월 ${day}일 (${weekday})`;

    // 카드뉴스 이미지 URL 조회
    const latestLog = await prisma.crawlerLog.findFirst({
      where: { status: 'SUCCESS', message: { startsWith: '[카드뉴스] 발행 성공' }, runAt: { gte: today } },
      orderBy: { id: 'desc' }
    });
    let cardImageUrl = null;
    let terminalUrl = 'https://chaovietnam.co.kr/daily-news-terminal/';
    if (latestLog?.errorDetails) {
      try {
        const details = JSON.parse(latestLog.errorDetails);
        if (details.imageUrl) cardImageUrl = details.imageUrl;
        if (details.terminalUrl) terminalUrl = details.terminalUrl;
      } catch (e) { /* ignore */ }
    }

    if (!cardImageUrl && !isTest) {
      return { success: false, error: '오늘 발행된 카드 이미지가 없습니다. 먼저 뉴스카드를 발행해주세요.' };
    }

    // 오늘의 뉴스 기사
    const recentNews = await prisma.newsItem.findMany({
      where: { status: 'PUBLISHED', isCardNews: true, publishedAt: { gte: today } },
      orderBy: { isTopNews: 'desc' }
    });
    const topNewsItems = recentNews.filter(n => n.isTopNews);
    const otherNewsItems = recentNews.filter(n => !n.isTopNews);
    const orderedItems = [...topNewsItems, ...otherNewsItems];

    // 활성 홍보카드
    const promoCards = await prisma.promoCard.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    // HTML 생성 (route.js의 로직과 동일)
    const htmlContent = buildEmailHtml(todayString, cardImageUrl, terminalUrl, orderedItems, promoCards);
    const subject = `[씬짜오베트남] 데일리뉴스 | ${todayString}`;

    await sendNewsletterWithFallback(targetEmails, subject, htmlContent);

    return { success: true, message: `${targetEmails.length}명에게 발송 완료` };
  } catch (error) {
    console.error('sendDailyEmailAction failed:', error);
    return { success: false, error: error.message };
  }
}

function buildEmailHtml(dateString, cardImageUrl, terminalUrl, newsItems, promoCards = []) {
  let html = `<div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 20px; background-color: #fff;">
    <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">씬짜오베트남 데일리뉴스 | ${dateString}</h2>
    <h1 style="font-size: 24px; color: #d1121d; margin-bottom: 20px;">씬짜오베트남 오늘의 뉴스</h1>`;

  if (cardImageUrl) {
    html += `<div style="margin-bottom: 30px;"><a href="${terminalUrl}" target="_blank" style="text-decoration: none;">
      <img src="${cardImageUrl}" alt="오늘의 뉴스 카드" style="max-width: 100%; height: auto; display: block; border: 1px solid #eee;" />
    </a></div>`;
  }

  if (newsItems && newsItems.length > 0) {
    newsItems.forEach(item => {
      const url = item.wordpressUrl || terminalUrl;
      const summary = (item.translatedSummary || item.summary || '').replace(/\n/g, '<br/>');
      html += `<div style="margin-bottom: 25px; line-height: 1.6;">
        <h3 style="font-size: 16px; font-weight: bold; margin: 0 0 8px 0; color: #222;">📍 ${item.translatedTitle || item.title}</h3>
        <p style="font-size: 14px; margin: 0 0 8px 0; color: #444;">${summary}</p>
        <div style="font-size: 13px;"><a href="${url}" style="color: #0056b3; text-decoration: underline; word-break: break-all;" target="_blank">자세한 내용은 링크를 클릭: ${url}</a></div>
      </div>`;
    });
  }

  if (promoCards && promoCards.length > 0) {
    html += `<div style="margin-top: 40px; border-top: 3px solid #f97316; padding-top: 24px;">
      <p style="font-size: 13px; font-weight: bold; color: #f97316; letter-spacing: 1px; margin: 0 0 20px 0;">📣 함께 홍보해요</p>`;
    promoCards.forEach(card => {
      const ytMatch = card.videoUrl?.match(/(?:youtube\.com.*v=|youtu\.be\/)([^&\n?#]+)/);
      const ytId = ytMatch ? ytMatch[1] : null;
      const imgSrc = card.imageUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null);
      html += `<div style="margin-bottom: 28px; background: #fff8f0; border: 1px solid #fed7aa; border-radius: 10px; overflow: hidden;">
        ${imgSrc ? `<a href="${card.linkUrl || '#'}" target="_blank" style="display:block;"><img src="${imgSrc}" alt="${card.title}" style="width:100%;max-height:280px;object-fit:cover;display:block;" /></a>` : ''}
        <div style="padding: 16px 20px;">
          <h3 style="font-size: 16px; font-weight: bold; color: #1f2937; margin: 0 0 8px 0;">${card.title}</h3>
          ${card.description ? `<p style="font-size: 13px; color: #4b5563; line-height: 1.7; white-space: pre-wrap; margin: 0 0 14px 0;">${card.description}</p>` : ''}
          ${card.linkUrl ? `<a href="${card.linkUrl}" target="_blank" style="display:inline-block;background:#f97316;color:#fff;font-size:13px;font-weight:bold;padding:10px 22px;border-radius:6px;text-decoration:none;">참여하기 →</a>` : ''}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  html += `<div style="margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px;">
    <div style="font-size: 12px; color: #666; line-height: 1.6;">
      <p style="margin: 0 0 5px 0;"><strong>HANHOA CO., LTD | www.chaovietnam.co.kr</strong></p>
      <p style="margin: 0 0 5px 0;">9Th Floor, EBM Building, 685-685 Dien Bien Phu, Ward 25, Binh Thanh</p>
      <p style="margin: 0;">T. 028)3511 1075 / 3511 1095 | E. info@chaovietnam.co.kr</p>
    </div>
  </div></div>`;

  return html;
}

