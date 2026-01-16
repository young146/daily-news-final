import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { translateNewsItem } from "@/lib/translator";

export async function POST(request) {
  try {
    const { ids } = await request.json();
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: "No IDs provided" }, { status: 400 });
    }

    console.log(`[BatchTranslate API] Starting translation for ${ids.length} items...`);
    
    const BATCH_SIZE = 10;
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

            // DRAFT 상태이고 3개 필드가 모두 있으면 스킵
            if (
              item?.translationStatus === "DRAFT" &&
              item.translatedTitle &&
              item.translatedSummary &&
              item.translatedContent
            ) {
              console.log(`[Skip] Already DRAFT with all fields: ${item.title?.substring(0, 30)}...`);
              return { status: "skipped", reason: "DRAFT_COMPLETE" };
            }

            // 번역 필요
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

      // 배치 간 대기
      if (i + BATCH_SIZE < ids.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
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
