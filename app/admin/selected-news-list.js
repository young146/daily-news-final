'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CategorySelector from './category-selector';
import { CardNewsToggle, WorkflowButton, DeleteSelectedNewsButton } from './batch-actions';
import { translateItemAction } from './actions';

export default function SelectedNewsList({ 
    initialTopNews, 
    removeFromTopAction, 
    toggleTopNewsAction,
    todayPublishedCount 
}) {
    const [topNews, setTopNews] = useState(initialTopNews);
    const [translatingId, setTranslatingId] = useState(null);
    const router = useRouter();

    useEffect(() => {
        setTopNews(initialTopNews);
    }, [initialTopNews]);

    const handleRetranslate = async (id) => {
        setTranslatingId(id);
        try {
            const result = await translateItemAction(id);
            if (result.success) {
                router.refresh();
            } else {
                alert('번역 실패: ' + result.error);
            }
        } catch (error) {
            alert('번역 중 오류: ' + error.message);
        }
        setTranslatingId(null);
    };

    const handleRemoveFromTop = async (formData) => {
        const id = formData.get('id');
        setTopNews(prev => prev.filter(item => item.id !== id));
        await removeFromTopAction(formData);
        router.refresh();
    };

    const handleToggleTopNews = async (formData) => {
        const id = formData.get('id');
        const currentItem = topNews.find(item => item.id === id);
        const willBeTopNews = !currentItem?.isTopNews;
        
        // Optimistic update
        setTopNews(prev => prev.map(item => 
            item.id === id ? { ...item, isTopNews: willBeTopNews } : item
        ));
        
        try {
            const result = await toggleTopNewsAction(formData);
            
            if (result.success) {
                // 성공 시 메시지 표시 (선택사항)
                if (result.message) {
                    // 짧은 성공 메시지는 표시하지 않거나, 필요시 토스트로 표시 가능
                }
                router.refresh();
            } else {
                // 실패 시 원래 상태로 되돌림
                setTopNews(prev => prev.map(item => 
                    item.id === id ? { ...item, isTopNews: !willBeTopNews } : item
                ));
                
                // 에러 메시지 표시
                alert(`❌ ${result.error || '탑뉴스 지정에 실패했습니다.'}`);
            }
        } catch (error) {
            // 예외 발생 시 원래 상태로 되돌림
            setTopNews(prev => prev.map(item => 
                item.id === id ? { ...item, isTopNews: !willBeTopNews } : item
            ));
            alert(`❌ 오류가 발생했습니다: ${error.message}`);
        }
    };

    // 오늘 탑뉴스 후보 추천: 선정된 것 중 인기검색어 점수가 가장 높은 기사.
    //   하루 1건 탑뉴스가 카드·SNS·이메일로 통일 발행되므로, 그 "한 번의 선택"을 점수로 돕는다.
    //   maxScore가 2 이상일 때만 추천(1점짜리를 굳이 밀지 않음). 동점이면 모두 추천 표시.
    const maxScore = Math.max(0, ...topNews.map(n => n.keywordScore || 0));

    return (
        <div className="border-2 border-gray-300 rounded-xl p-6 bg-white shadow-sm">
            <h2 className="text-2xl font-bold mb-6 flex justify-between items-center text-blue-800 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    선정된 뉴스
                    <span className="text-lg font-bold bg-blue-100 text-blue-900 px-4 py-2 rounded-lg border-2 border-blue-300">{topNews.length}개</span>
                </div>
                <div className="flex gap-2">
                    <WorkflowButton topNews={topNews} />
                </div>
            </h2>
            <div className="space-y-5 h-[80vh] overflow-y-auto pr-2">
                {topNews.map(item => (
                    <div key={item.id} className={`p-6 rounded-xl border-2 ${item.isTopNews ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-200' : 'bg-blue-50 border-blue-300'}`}>
                        <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="text-lg font-bold text-blue-700 uppercase">{item.source}</span>
                                {item.isTopNews && <span className="text-base bg-yellow-400 text-yellow-900 px-3 py-1 rounded-lg font-bold border-2 border-yellow-500">★ TOP NEWS</span>}
                                {/* 인기 검색어 관련도 — 탑뉴스 결정을 돕는 신호 */}
                                {item.keywordScore > 0 && (
                                    <span
                                        className={`inline-flex items-center gap-1 text-base font-bold px-3 py-1 rounded-lg border-2 ${item.keywordScore >= 3 ? 'bg-orange-100 text-orange-800 border-orange-300' : item.keywordScore === 2 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                                        title="인기 검색어 관련도 (한국인의 베트남 검색 수요 기준)"
                                    >
                                        🔥 {item.keywordScore}{item.matchedKeyword ? ` · ${item.matchedKeyword}` : ''}
                                    </span>
                                )}
                                {/* 오늘 탑뉴스 추천: 최고점(2점 이상)이면서 아직 탑뉴스가 아닌 기사 */}
                                {maxScore >= 2 && item.keywordScore === maxScore && !item.isTopNews && (
                                    <span className="text-base bg-orange-500 text-white px-3 py-1 rounded-lg font-bold border-2 border-orange-600">
                                        👍 추천 탑뉴스
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <span className={`text-base font-bold px-3 py-1 rounded-lg border-2 ${item.translationStatus === 'COMPLETED' ? 'bg-green-100 text-green-800 border-green-300' :
                                    item.translationStatus === 'DRAFT' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                                        'bg-gray-200 text-gray-800 border-gray-400'
                                    }`}>
                                    {item.translationStatus}
                                </span>
                            </div>
                        </div>

                        <h3 className="text-2xl font-bold text-gray-900 mb-4 leading-snug">
                            <Link href={`/admin/news/${item.id}/translate`} className="hover:text-blue-700 hover:underline flex items-center gap-2 group">
                                {item.translatedTitle || item.title}
                                <span className="opacity-0 group-hover:opacity-100 text-base text-blue-700 font-semibold">✎ Edit</span>
                            </Link>
                            {!item.translatedTitle && (
                                <span className="inline-flex items-center gap-2 text-base font-bold bg-red-100 text-red-800 px-3 py-1.5 rounded-lg mt-2 border-2 border-red-300">
                                    ⚠️ 번역 필요
                                    <button
                                        onClick={() => handleRetranslate(item.id)}
                                        disabled={translatingId === item.id}
                                        className="ml-1 bg-yellow-500 text-white px-3 py-1 rounded-md hover:bg-yellow-600 disabled:opacity-50 text-base font-bold"
                                    >
                                        {translatingId === item.id ? '⏳' : '🔄 재번역'}
                                    </button>
                                </span>
                            )}
                        </h3>

                        <div className="mb-4 min-w-[220px]">
                            <CategorySelector id={item.id} initialCategory={item.category} />
                        </div>

                        <div className="flex justify-between items-center mt-5 pt-4 border-t-2 border-blue-200">
                            <div className="flex gap-3 items-center flex-wrap">
                                <CardNewsToggle id={item.id} isCardNews={item.isCardNews} />
                                <form action={handleRemoveFromTop}>
                                    <input type="hidden" name="id" value={item.id} />
                                    <button type="submit" className="text-lg font-bold text-red-700 hover:text-red-900 hover:underline">
                                        ← Unselect
                                    </button>
                                </form>
                                <form action={handleToggleTopNews}>
                                    <input type="hidden" name="id" value={item.id} />
                                    <button type="submit" className={`text-lg font-bold flex items-center gap-1 ${item.isTopNews ? 'text-yellow-700' : 'text-gray-700 hover:text-yellow-600'}`}>
                                        {item.isTopNews ? '★ Unset Top' : '☆ Set as Top'}
                                    </button>
                                </form>
                                <DeleteSelectedNewsButton id={item.id} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {topNews.length === 0 && (
                <div className="text-center py-14 border-2 border-dashed border-gray-300 rounded-xl">
                    {todayPublishedCount > 0 ? (
                        <div className="space-y-3">
                            <div className="text-5xl">✅</div>
                            <p className="text-green-700 font-bold text-2xl">오늘 {todayPublishedCount}개 뉴스 발행 완료!</p>
                            <p className="text-gray-700 text-base font-semibold">새 뉴스를 선택하려면 왼쪽에서 추가하세요.</p>
                        </div>
                    ) : (
                        <p className="text-gray-700 text-lg font-semibold">왼쪽에서 뉴스를 선택하세요.</p>
                    )}
                </div>
            )}
        </div>
    );
}
