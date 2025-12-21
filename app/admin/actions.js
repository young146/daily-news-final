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
      data.isPublishedMain = true;
      data.publishedAt = new Date(); // WordPress 발행 시점 기록 (근본 해결)
      data.status = "PUBLISHED";
      
      // 새로운 뉴스가 발행되면 이전 카드 뉴스 초기화
      await prisma.newsItem.updateMany({
        where: { isCardNews: true },
        data: { isCardNews: false },
      });
      console.log(`[Publish] ✅ Cleared isCardNews flags - new news published`);
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
      data.isPublishedMain = true;
      data.isPublishedDaily = true;
      data.publishedAt = new Date();
      data.status = "PUBLISHED";
      
      // 새로운 뉴스가 발행되면 이전 카드 뉴스 초기화
      await prisma.newsItem.updateMany({
        where: { isCardNews: true },
        data: { isCardNews: false },
      });
      console.log(`[Publish] ✅ Cleared isCardNews flags - new news published`);
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
    return { success: true };
  } catch (error) {
    console.error("Category update failed:", error);
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
