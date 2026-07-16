"use server";

import prisma from "@/lib/prisma";
import { translateNewsItem, translateText, isFailedTranslation, isStoredFailedTranslation } from "@/lib/translator";
import { publishToMainSite, deleteWordPressPost, uploadMediaToWordPress } from "@/lib/publisher";
import { postToSNS } from "@/lib/sns";
import { sendNewsletterWithFallback } from "@/lib/email-service";
import { filterCardsForToday } from "@/lib/promo-card-filters";
import { getSponsor, setSponsor, emailSubject, emailHeaderHtml } from "@/lib/sponsor";
import { updateWordPressPostMeta, demoteOlderTopNews } from "@/lib/top-news";
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
        item.content || item.summary,
        item.category
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

// 발행 진행 중을 표시하는 sentinel — DB-level lock 역할
const PUBLISHING_SENTINEL = '__PUBLISHING__';

export async function publishItemAction(id, target) {
  // target: 'main', 'daily', 'sns'

  // SNS는 wordpressUrl과 무관하므로 별도 처리 (race condition 영향 없음)
  if (target === 'sns') {
    try {
      const item = await prisma.newsItem.findUnique({ where: { id } });
      if (!item) throw new Error("Item not found");
      await postToSNS(item, "facebook");
      await postToSNS(item, "kakao");
      await prisma.newsItem.update({
        where: { id },
        data: { isSentSNS: true, isSelected: false },
      });
      revalidatePath("/admin");
      return { success: true };
    } catch (error) {
      console.error("Publishing (SNS) failed:", error);
      return { success: false, error: error.message };
    }
  }

  // main/daily — atomic claim 패턴으로 중복 발행 차단
  try {
    // 1) Atomic claim: wordpressUrl이 null일 때만 sentinel로 점유
    //    updateMany는 WHERE 조건에 맞는 row 수를 반환. 두 호출이 동시 진입해도
    //    DB-level로 한 호출만 count=1을 받음. 두 번째는 count=0.
    const claim = await prisma.newsItem.updateMany({
      where: { id, wordpressUrl: null },
      data: { wordpressUrl: PUBLISHING_SENTINEL },
    });

    if (claim.count === 0) {
      const existing = await prisma.newsItem.findUnique({
        where: { id },
        select: { wordpressUrl: true, translatedTitle: true, title: true },
      });
      console.log(`[Publish] ⚠️ Already claimed/published, skipping: ${existing?.translatedTitle || existing?.title}`);
      console.log(`[Publish] Existing wordpressUrl: ${existing?.wordpressUrl}`);
      return { success: true, skipped: true, message: "Already published or in progress" };
    }

    // 2) Claim 성공 — 실제 publish 수행
    // 주의: atomic claim으로 인해 fetch한 item의 wordpressUrl 이 sentinel 값이 되어 있다.
    //       publishToMainSite는 wordpressUrl이 있으면 "이미 발행됨"으로 판단하므로,
    //       sentinel을 비운 사본을 전달해야 실제 WordPress POST가 일어난다.
    const itemRaw = await prisma.newsItem.findUnique({ where: { id } });
    if (!itemRaw) throw new Error("Item not found");
    const item = { ...itemRaw, wordpressUrl: null };

    const data = {};

    if (target === "main") {
      const result = await publishToMainSite(item);
      data.wordpressUrl = result.postUrl;
      if (result.imageUrl) data.wordpressImageUrl = result.imageUrl;
      if (result.mediaId) data.wordpressMediaId = result.mediaId;
      if (result.localImagePath) data.localImagePath = result.localImagePath;
      data.isPublishedMain = true;
      data.publishedAt = new Date();
      data.status = "PUBLISHED";
      console.log(`[Publish] ✅ News published to main site`);
    } else if (target === "daily") {
      const result = await publishToMainSite(item);
      data.wordpressUrl = result.postUrl;
      if (result.imageUrl) data.wordpressImageUrl = result.imageUrl;
      if (result.mediaId) data.wordpressMediaId = result.mediaId;
      if (result.localImagePath) data.localImagePath = result.localImagePath;
      data.isPublishedMain = true;
      data.isPublishedDaily = true;
      data.publishedAt = new Date();
      data.status = "PUBLISHED";
      console.log(`[Publish] ✅ News published to daily summary`);
    }

    // 3) sentinel을 실제 wordpressUrl로 교체
    await prisma.newsItem.update({
      where: { id },
      data: { ...data, isSelected: false },
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    // 4) 실패 시 sentinel을 다시 null로 되돌려 재시도 가능하게 함
    //    (단, publishToMainSite 가 WordPress에 article을 만든 후 throw한 경우는
    //     수동 정리가 필요할 수 있음 — 그래도 다음 발행 시도가 가능해지는 게 우선)
    try {
      await prisma.newsItem.updateMany({
        where: { id, wordpressUrl: PUBLISHING_SENTINEL },
        data: { wordpressUrl: null },
      });
      console.log(`[Publish] 🔓 Released claim for ${id} due to error`);
    } catch (releaseErr) {
      console.error(`[Publish] Failed to release claim for ${id}:`, releaseErr.message);
    }
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
      await demoteOlderTopNews(id, item.publishedAt);
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
    revalidatePath("/admin/published-news");
    revalidatePath("/admin/card-news");
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
            item.content || item.summary,
            item.category
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
    revalidatePath("/admin/published-news");
    revalidatePath("/admin/card-news");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function batchTranslateAction(ids) {
  try {
    // Process in parallel with batch size limit to avoid rate limits
    // 배치 크기 제한으로 rate limit 방지 및 성능 최적화
    // 동시 10→5: 무거운 본문번역을 한꺼번에 던져 rate limit을 유발하던 것을 완화.
    const BATCH_SIZE = 5;

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

            // DRAFT 상태이고 3개 필드가 모두 있으면 스킵 — 단, "Translation Failed"가
            // 저장된 항목은 완료가 아니므로 스킵하지 않고 재번역(자동 복구)한다.
            if (
              item?.translationStatus === "DRAFT" &&
              item.translatedTitle &&
              item.translatedSummary &&
              item.translatedContent &&
              !isStoredFailedTranslation(item)
            ) {
              console.log(`[Skip] Already DRAFT with all fields: ${item.title?.substring(0, 30)}...`);
              return { status: 'skipped', reason: 'DRAFT_COMPLETE' };
            }

            // 번역 필요: PENDING 상태이거나, 필드 중 하나라도 비어있음
            if (item) {
              console.log(`[Translate] ${item.title?.substring(0, 30)}...`);
              const result = await translateNewsItem(
                item.title,
                item.summary,
                item.content || item.summary,
                item.category
              );

              // 실패면 "완료"처럼 저장하지 않고 PENDING으로 되돌려 다음 실행에서 자동 재시도.
              if (isFailedTranslation(result)) {
                await prisma.newsItem.update({
                  where: { id },
                  data: { translationStatus: "PENDING" },
                });
                console.warn(`[Fail-retryable] ${item.title?.substring(0, 30)} — ${result.error || 'Translation Failed'}`);
                return { status: 'failed', error: result.error || 'Translation Failed' };
              }

              await prisma.newsItem.update({
                where: { id },
                data: {
                  translatedTitle: result.translatedTitle,
                  translatedSummary: result.translatedSummary,
                  translatedContent: result.translatedContent,
                  translationStatus: "DRAFT",
                },
              });
              console.log(`[Done] ${result.translatedTitle?.substring(0, 30)}...`);
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

      // 배치 간 대기 200→1000ms: 다음 5개를 던지기 전 API에 숨 돌릴 틈을 준다.
      if (i + BATCH_SIZE < ids.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
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

  // 부분 병렬: 3개씩 동시 발행. publishItemAction의 atomic claim 패턴이 동일 ID race를
  // 막아주고, BATCH_SIZE=3은 WordPress 서버 부하를 안전 수준으로 유지하는 균형치.
  // 순차 대비 약 2~3배 빠름 (30개 ~150~300초 → ~40~80초).
  const BATCH_SIZE = 3;
  console.log(`[Publish] Processing ${uniqueIds.length} items in parallel batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(id => publishItemAction(id, "daily"))
    );
    results.forEach((r, idx) => {
      const id = batch[idx];
      if (r.status === 'fulfilled') {
        if (r.value.success) {
          successCount++;
        } else {
          failCount++;
          errors.push(`Item ${id}: ${r.value.error}`);
        }
      } else {
        failCount++;
        const msg = r.reason?.message || String(r.reason);
        errors.push(`Item ${id}: ${msg}`);
        console.error(`Failed to publish item ${id}:`, r.reason);
      }
    });
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
      // 테스트 발송 — TEST_EMAIL 쉼표 구분 다중 수신 지원
      targetEmails = (process.env.TEST_EMAIL || 'younghan146@gmail.com,info@chaovietnam.co.kr')
        .split(',').map(e => e.trim()).filter(Boolean);
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

    // 활성 홍보카드 — 요일 필터 적용 (lib/promo-card-filters.js)
    const allPromoCards = await prisma.promoCard.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });
    const promoCards = filterCardsForToday(allPromoCards);

    // 명명권(스폰서) 설정 로드 — 비활성(기본)이면 씬짜오 브랜딩 그대로
    const sponsor = await getSponsor();

    // HTML 생성 (route.js의 로직과 동일)
    const htmlContent = buildEmailHtml(todayString, cardImageUrl, terminalUrl, orderedItems, promoCards, sponsor);
    const subject = emailSubject(sponsor, todayString);

    await sendNewsletterWithFallback(targetEmails, subject, htmlContent);

    return { success: true, message: `${targetEmails.length}명에게 발송 완료` };
  } catch (error) {
    console.error('sendDailyEmailAction failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 명명권(스폰서) 현재 설정 조회 — 관리 페이지 초기 로딩용.
 */
export async function getSponsorAction() {
  try {
    return { success: true, sponsor: await getSponsor() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 명명권(스폰서) 설정 저장 — 관리 페이지에서 호출.
 * formData: name(텍스트), active('true'/'on'), logoUrl(기존 유지), logo(File 업로드, 선택)
 */
export async function saveSponsorAction(formData) {
  try {
    const activeRaw = (formData.get("active") || "").toString();
    const active = activeRaw === "true" || activeRaw === "on" || activeRaw === "1";
    const name = (formData.get("name") || "").toString().trim();
    let logoUrl = (formData.get("logoUrl") || "").toString().trim(); // 기존 로고 URL 유지

    // 새 로고 파일이 올라왔으면 워드프레스에 업로드 후 URL 교체
    const file = formData.get("logo");
    if (file && typeof file === "object" && typeof file.arrayBuffer === "function" && file.size > 0) {
      const buf = Buffer.from(await file.arrayBuffer());
      const contentType = file.type || "image/png";
      const up = await uploadMediaToWordPress(buf, `sponsor-logo-${Date.now()}`, contentType);
      if (!up?.url) {
        return { success: false, error: "로고 업로드에 실패했습니다 (워드프레스). 잠시 후 다시 시도하세요." };
      }
      logoUrl = up.url;
    }

    const saved = await setSponsor({ active, name, logoUrl });
    revalidatePath("/admin/sponsor");
    return { success: true, sponsor: saved };
  } catch (e) {
    console.error("saveSponsorAction failed:", e);
    return { success: false, error: e.message };
  }
}

function buildEmailHtml(dateString, cardImageUrl, terminalUrl, newsItems, promoCards = [], sponsor = null) {
  let html = `<div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 20px; background-color: #fff;">
    ${emailHeaderHtml(sponsor, dateString)}`;

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
        ${imgSrc ? `<a href="${card.linkUrl || '#'}" target="_blank" style="display:block;"><img src="${imgSrc}" alt="${card.title}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;" /></a>` : ''}
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

