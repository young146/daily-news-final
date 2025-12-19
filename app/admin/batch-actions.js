'use client';
import { useTransition, useOptimistic, useState } from 'react';
import { batchTranslateAction, batchPublishDailyAction, toggleCardNewsAction, batchTranslateTitlesAction, deleteSelectedNewsAction } from './actions';
import { useRouter } from 'next/navigation';

export function BatchTranslateTitlesButton({ ids }) {
    const [isPending, startTransition] = useTransition();

    // If all items are already translated (ids array is empty), show a solid status badge instead of a disabled button
    if (ids.length === 0) {
        return (
            <div className="bg-green-600 text-white px-4 py-2 rounded shadow-md font-bold flex items-center gap-2 border-2 border-green-800 cursor-default">
                ✅ All Titles Translated
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => startTransition(() => batchTranslateTitlesAction(ids))}
            disabled={isPending}
            className="bg-blue-800 text-white px-4 py-2 rounded shadow-md hover:bg-blue-900 flex items-center gap-2 font-bold transition-all transform hover:scale-105 border-2 border-blue-950"
            style={{ backgroundColor: '#1e40af' }} // Force dark blue
        >
            {isPending ? 'Translating...' : `✨ Translate ${ids.length} Titles (A→가)`}
        </button>
    );
}

export function BatchTranslateButton({ ids, redirectId }) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    return (
        <button
            type="button"
            onClick={() => startTransition(async () => {
                await batchTranslateAction(ids);
                if (redirectId) {
                    router.push(`/admin/news/${redirectId}/translate`);
                } else if (ids.length > 0) {
                    router.push(`/admin/news/${ids[0]}/translate`);
                }
            })}
            disabled={isPending || ids.length === 0}
            className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
        >
            {isPending ? 'Processing...' : '⚡ Run Translation & Start Review'}
        </button>
    );
}

export function BatchPublishButton({ ids }) {
    const [isPending, startTransition] = useTransition();
    return (
        <button
            type="button"
            onClick={() => {
                if (confirm(`Are you sure you want to publish ${ids.length} items to the Daily News site?`)) {
                    startTransition(() => batchPublishDailyAction(ids));
                }
            }}
            disabled={isPending || ids.length === 0}
            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
        >
            {isPending ? 'Publishing...' : '🚀 Publish Daily'}
        </button>
    );
}

export function DeleteSelectedNewsButton({ id }) {
    const [isPending, startTransition] = useTransition();

    return (
        <button
            type="button"
            onClick={() => {
                if (confirm('이 뉴스를 삭제하시겠습니까?')) {
                    startTransition(() => deleteSelectedNewsAction(id));
                }
            }}
            disabled={isPending}
            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
            title="삭제"
        >
            {isPending ? '...' : '🗑️'}
        </button>
    );
}

export function CardNewsToggle({ id, isCardNews }) {
    const [optimisticIsCardNews, setOptimisticIsCardNews] = useOptimistic(
        isCardNews,
        (state, newState) => newState
    );
    const [isPending, startTransition] = useTransition();

    return (
        <button
            type="button"
            onClick={() => {
                const newState = !optimisticIsCardNews;
                startTransition(async () => {
                    setOptimisticIsCardNews(newState);
                    await toggleCardNewsAction(id);
                });
            }}
            disabled={isPending}
            className={`text-xs px-2 py-1 rounded border transition-colors ${optimisticIsCardNews ? 'bg-pink-100 border-pink-300 text-pink-700 font-bold' : 'bg-white border-gray-200 text-gray-400 hover:text-pink-500'}`}
        >
            {optimisticIsCardNews ? '♥ Card News' : '♡ Card News'}
        </button>
    );
}

export function WorkflowButton({ topNews }) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    // 1. Check if any items need translation (Title, Summary, OR Content missing)
    const needsTranslation = topNews.some(n => !n.translatedTitle || !n.translatedSummary || !n.translatedContent);

    // 2. Check if any items need review (are translated but not COMPLETED and not SKIPPED)
    // We prioritize DRAFT items.
    // Ensure we DO NOT pick up items that are already COMPLETED.
    // 2. Check if any items need review (are translated but not COMPLETED and not SKIPPED)
    // We prioritize DRAFT items, but also catch anything that is NOT completed/skipped.
    const nextReviewItem = topNews.find(n =>
        n.translationStatus !== 'COMPLETED' &&
        n.translationStatus !== 'SKIPPED'
    );
    const skippedItems = topNews.filter(n => n.translationStatus === 'SKIPPED');
    const completedItems = topNews.filter(n => n.translationStatus === 'COMPLETED');

    // If we have DRAFT items, we are NOT complete.
    // If we have NO DRAFT items, but have SKIPPED items, we are "Technically Complete" but have leftovers.
    const hasPendingReviews = !!nextReviewItem;
    const hasSkippedItems = skippedItems.length > 0;
    const isFullyComplete = !hasPendingReviews && !hasSkippedItems;

    const handleAction = () => {
        startTransition(async () => {
            if (needsTranslation) {
                // Step 1: Translate All (or missing ones)
                // We send ALL IDs to be safe, the server action will check which ones actually need work
                const idsToTranslate = topNews.map(n => n.id);
                await batchTranslateAction(idsToTranslate);

                // After translation, go to the first item to start review
                if (topNews.length > 0) {
                    router.push(`/admin/news/${topNews[0].id}/translate`);
                }
            } else if (hasPendingReviews) {
                // Step 2: Continue Review (Prioritize DRAFTs)
                if (nextReviewItem) {
                    router.push(`/admin/news/${nextReviewItem.id}/translate`);
                }
            } else {
                // Step 3: Publish All (Completed ones)
                // If there are skipped items, we mention them.

                const topCount = completedItems.filter(n => n.isTopNews).length;
                const socCount = completedItems.filter(n => (n.category === 'Society' || n.category === '사회') && !n.isTopNews).length;
                const ecoCount = completedItems.filter(n => (n.category === 'Economy' || n.category === '경제') && !n.isTopNews).length;
                const culCount = completedItems.filter(n => (n.category === 'Culture' || n.category === '문화') && !n.isTopNews).length;
                const polCount = completedItems.filter(n => (n.category === 'Politics' || n.category === 'Policy' || n.category === '정치' || n.category === '정책') && !n.isTopNews).length;
                const intCount = completedItems.filter(n => (n.category === 'International' || n.category === '국제') && !n.isTopNews).length;
                const kvCount = completedItems.filter(n => (n.category === 'Korea-Vietnam' || n.category === '한-베' || n.category === '한베') && !n.isTopNews).length;
                const comCount = completedItems.filter(n => (n.category === 'Community' || n.category === '교민' || n.category === '교민소식') && !n.isTopNews).length;
                const travelCount = completedItems.filter(n => (n.category === 'Travel' || n.category === '여행') && !n.isTopNews).length;
                const healthCount = completedItems.filter(n => (n.category === 'Health' || n.category === '건강') && !n.isTopNews).length;
                const foodCount = completedItems.filter(n => (n.category === 'Food' || n.category === '음식') && !n.isTopNews).length;

                let message = `
✨ Ready to Publish!

Summary of COMPLETED Reviews:
-----------------------------
★ Top News: ${topCount}
-----------------------------
• Society: ${socCount}
• Economy: ${ecoCount}
• Culture: ${culCount}
• Politics: ${polCount}
• International: ${intCount}
• Korea-Vietnam: ${kvCount}
• Community: ${comCount}
• Travel: ${travelCount}
• Health: ${healthCount}
• Food: ${foodCount}
-----------------------------
Total Completed: ${completedItems.length} items
`;

                if (hasSkippedItems) {
                    message += `
⚠️ WARNING: You have ${skippedItems.length} SKIPPED items.
These will NOT be published now. You can review them later.
`;
                }

                message += `\nDo you want to PUBLISH these ${completedItems.length} items to the Daily News site now?`;

                if (confirm(message.trim())) {
                    const result = await batchPublishDailyAction(completedItems.map(n => n.id));
                    if (result.failCount > 0) {
                        alert(`⚠️ 일부 뉴스 발행 실패\n\n성공: ${result.successCount}개\n실패: ${result.failCount}개\n\n[에러 내용]\n${result.errors.join('\n')}`);
                    } else {
                        alert(`✅ ${result.successCount}개 뉴스 발행 완료!`);
                    }
                } else if (hasSkippedItems && confirm("Do you want to review the SKIPPED items now instead?")) {
                    router.push(`/admin/news/${skippedItems[0].id}/translate`);
                }
            }
        });
    };

    if (needsTranslation) {
        return (
            <button
                type="button"
                onClick={handleAction}
                disabled={isPending}
                className="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700 flex items-center gap-2 font-bold"
            >
                {isPending ? 'Translating & Generating...' : '🚀 Translate & Generate (Selected Items Only)'}
            </button>
        );
    }

    if (hasPendingReviews) {
        const completedCount = topNews.filter(n => n.translationStatus === 'COMPLETED').length;
        return (
            <div className="flex flex-col gap-1 items-end">
                <button
                    type="button"
                    onClick={handleAction}
                    disabled={isPending}
                    className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 flex items-center gap-2 font-bold"
                >
                    {isPending ? 'Loading...' : `▶ Continue Review (${completedCount}/${topNews.length} Done)`}
                </button>
                {completedCount > 0 && (
                    <button
                        type="button"
                        onClick={() => {
                            if (confirm(`Publish the ${completedCount} COMPLETED items now? (Others will remain as Draft/Skipped)`)) {
                                startTransition(() => batchPublishDailyAction(completedItems.map(n => n.id)));
                            }
                        }}
                        disabled={isPending}
                        className="text-sm bg-green-100 text-green-800 px-3 py-1.5 rounded border border-green-300 hover:bg-green-200 font-bold flex items-center gap-1 mt-1"
                    >
                        ⚡ Publish {completedCount} Completed Items Now
                    </button>
                )}
            </div>
        );
    }

    // Ready to Publish (either fully complete or with skipped items)
    return (
        <button
            type="button"
            onClick={handleAction}
            disabled={isPending}
            className={`text-white px-4 py-2 rounded shadow flex items-center gap-2 font-bold ${hasSkippedItems ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}
        >
            {isPending ? 'Publishing...' : hasSkippedItems ? `✨ Publish ${completedItems.length} Items (Skip ${skippedItems.length})` : '✨ Publish All to Daily (Final Step)'}
        </button>
    );
}
