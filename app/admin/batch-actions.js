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
    const [isTranslating, setIsTranslating] = useState(false);
    const router = useRouter();

    // 번역이 필요한 항목 (제목, 요약, 본문 중 하나라도 없음)
    const itemsNeedingTranslation = topNews.filter(n => !n.translatedTitle || !n.translatedSummary || !n.translatedContent);
    const needsTranslation = itemsNeedingTranslation.length > 0;

    // 리뷰가 필요한 항목 (COMPLETED/SKIPPED가 아닌 것)
    const draftItems = topNews.filter(n => 
        n.translationStatus !== 'COMPLETED' && 
        n.translationStatus !== 'SKIPPED'
    );
    const nextReviewItem = draftItems[0];
    const skippedItems = topNews.filter(n => n.translationStatus === 'SKIPPED');
    const completedItems = topNews.filter(n => n.translationStatus === 'COMPLETED');

    const hasPendingReviews = draftItems.length > 0;
    const hasCompletedItems = completedItems.length > 0;
    const hasSkippedItems = skippedItems.length > 0;

    // 백그라운드 번역 (페이지를 떠나도 계속 진행)
    const handleBackgroundTranslate = async () => {
        const idsToTranslate = topNews.map(n => n.id);
        setIsTranslating(true);
        
        try {
            // API 호출 (백그라운드에서 실행됨)
            const response = await fetch('/api/batch-translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsToTranslate }),
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(`✅ 번역 완료!\n\n번역: ${result.translatedCount}개\n스킵(이미완료): ${result.skippedCount}개\n실패: ${result.failedCount}개`);
                // 번역 완료 후 첫 번째 항목으로 리뷰 시작
                if (topNews.length > 0) {
                    router.push(`/admin/news/${topNews[0].id}/translate`);
                }
            } else {
                alert(`❌ 번역 실패: ${result.error}`);
            }
        } catch (error) {
            alert(`❌ 번역 중 오류: ${error.message}`);
        } finally {
            setIsTranslating(false);
            router.refresh();
        }
    };

    // 발행 핸들러
    const handlePublish = () => {
        // 🛡️ 이미 발행 중이면 무시 (중복 발행 방지)
        if (isPending) {
            console.warn('[Publish] Already in progress, ignoring duplicate call');
            return;
        }
        
        const topCount = completedItems.filter(n => n.isTopNews).length;
        const socCount = completedItems.filter(n => (n.category === 'Society' || n.category === '사회') && !n.isTopNews).length;
        const ecoCount = completedItems.filter(n => (n.category === 'Economy' || n.category === '경제') && !n.isTopNews).length;
        const realEstateCount = completedItems.filter(n => (n.category === 'Real Estate' || n.category === '부동산') && !n.isTopNews).length;
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
• Real Estate: ${realEstateCount}
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

        if (draftItems.length > 0) {
            message += `\n⚠️ ${draftItems.length}개 DRAFT 항목은 발행되지 않습니다.`;
        }
        if (hasSkippedItems) {
            message += `\n⚠️ ${skippedItems.length}개 SKIPPED 항목은 발행되지 않습니다.`;
        }

        message += `\n\nDo you want to PUBLISH these ${completedItems.length} items now?`;

        if (confirm(message.trim())) {
            console.log(`[Publish] Starting batch publish for ${completedItems.length} items`);
            console.log(`[Publish] IDs:`, completedItems.map(n => n.id));
            
            startTransition(async () => {
                const result = await batchPublishDailyAction(completedItems.map(n => n.id));
                console.log(`[Publish] Batch publish completed - Success: ${result.successCount}, Failed: ${result.failCount}`);
                
                if (result.failCount > 0) {
                    alert(`⚠️ 일부 뉴스 발행 실패\n\n성공: ${result.successCount}개\n실패: ${result.failCount}개\n\n[에러 내용]\n${result.errors.join('\n')}`);
                } else {
                    alert(`✅ ${result.successCount}개 뉴스 발행 완료!`);
                }
            });
        }
    };

    // 리뷰 계속하기
    const handleContinueReview = () => {
        if (nextReviewItem) {
            router.push(`/admin/news/${nextReviewItem.id}/translate`);
        }
    };

    // 버튼 렌더링 - 상황에 따라 여러 버튼 표시
    return (
        <div className="flex flex-col gap-2 items-end">
            {/* 1. 번역 필요 시 번역 버튼 */}
            {needsTranslation && (
                <button
                    type="button"
                    onClick={handleBackgroundTranslate}
                    disabled={isTranslating || isPending}
                    className="bg-purple-600 text-white px-4 py-2 rounded shadow hover:bg-purple-700 flex items-center gap-2 font-bold"
                >
                    {isTranslating ? '⏳ 번역 중... (페이지 이동 가능)' : `🚀 번역 & 요약 생성 (${itemsNeedingTranslation.length}개)`}
                </button>
            )}

            {/* 2. 리뷰할 DRAFT가 있으면 리뷰 버튼 */}
            {!needsTranslation && hasPendingReviews && (
                <button
                    type="button"
                    onClick={handleContinueReview}
                    disabled={isPending}
                    className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 flex items-center gap-2 font-bold"
                >
                    ▶ 리뷰 계속하기 ({completedItems.length}/{topNews.length} 완료)
                </button>
            )}

            {/* 3. COMPLETED 항목이 있으면 발행 버튼 (항상 표시) */}
            {hasCompletedItems && (
                <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isPending}
                    className={`px-4 py-2 rounded shadow flex items-center gap-2 font-bold ${
                        !hasPendingReviews && !needsTranslation
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
                    }`}
                >
                    {isPending ? '발행 중...' : `✨ ${completedItems.length}개 발행하기`}
                </button>
            )}

            {/* 4. 모든 작업 완료 상태 */}
            {!needsTranslation && !hasPendingReviews && !hasCompletedItems && (
                <div className="text-gray-500 text-sm">
                    선정된 뉴스가 없습니다
                </div>
            )}
        </div>
    );
}
