import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { translateNewsItem, isFailedTranslation, isStoredFailedTranslation } from "@/lib/translator";

// 본문 전체번역은 건당 10~18초. Vercel이 배치 도중 함수를 죽이지 않도록 최대 실행시간 확보.
// (설령 시간초과로 죽어도, 실패는 저장하지 않으므로 다음 실행에서 자동 이어짐 — 비파괴적)
export const maxDuration = 60;

export async function POST(request) {
  try {
    const { ids } = await request.json();
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: "No IDs provided" }, { status: 400 });
    }

    console.log(`[BatchTranslate API] Starting translation for ${ids.length} items...`);
    
    // 동시 10→5: 무거운 본문번역을 한꺼번에 던져 rate limit을 유발하던 것을 완화.
    const BATCH_SIZE = 5;
    let skippedCount = 0;
    let translatedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (id) => {
          try {
            const item = await prisma.newsItem.findUnique({ where: { id } });

            // COMPLETED 상태는 무조건 스킵
            if (item?.translationStatus === "COMPLETED") {
              console.log(`[Skip] Already COMPLETED: ${item.title?.substring(0, 30)}...`);
              return { status: "skipped", reason: "COMPLETED" };
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
              return { status: "skipped", reason: "DRAFT_COMPLETE" };
            }

            // 번역 필요
            if (item) {
              console.log(`[Translate] ${item.title?.substring(0, 30)}...`);
              const result = await translateNewsItem(
                item.title,
                item.summary,
                item.content || item.summary,
                item.category
              );

              // 실패면 DB에 "완료"처럼 저장하지 않는다 → PENDING으로 되돌려 다음 실행에서
              // 자동 재시도. (이게 27개가 눌러앉던 근본 고리를 끊는다)
              if (isFailedTranslation(result)) {
                await prisma.newsItem.update({
                  where: { id },
                  data: { translationStatus: "PENDING" },
                });
                console.warn(`[Fail-retryable] ${item.title?.substring(0, 30)} — ${result.error || "Translation Failed"}`);
                return { status: "failed", error: result.error || "Translation Failed" };
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
              return { status: "translated" };
            }
            return { status: "skipped", reason: "NOT_FOUND" };
          } catch (e) {
            console.error(`Failed to translate item ${id}:`, e);
            return { status: "failed", error: e.message };
          }
        })
      );

      // 결과 집계
      results.forEach((r) => {
        if (r.status === "fulfilled") {
          if (r.value.status === "skipped") skippedCount++;
          else if (r.value.status === "translated") translatedCount++;
          else if (r.value.status === "failed") failedCount++;
        } else {
          failedCount++;
        }
      });

      // 배치 간 대기 200→1000ms: 다음 5개를 던지기 전 API에 숨 돌릴 틈을 준다.
      if (i + BATCH_SIZE < ids.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`[BatchTranslate API] 완료 - 번역: ${translatedCount}, 스킵: ${skippedCount}, 실패: ${failedCount}`);

    return NextResponse.json({
      success: true,
      translatedCount,
      skippedCount,
      failedCount,
      message: `번역: ${translatedCount}개, 스킵(이미완료): ${skippedCount}개, 실패: ${failedCount}개`,
    });
  } catch (error) {
    console.error("[BatchTranslate API] Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
