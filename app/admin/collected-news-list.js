'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { batchDeleteAction, translateItemAction } from './actions';
import CategorySelector from './category-selector';

export default function CollectedNewsList({ items, addToTopAction, deleteNewsItemAction }) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [translatingId, setTranslatingId] = useState(null);
    const router = useRouter();

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

    const toggleSelect = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) 
                ? prev.filter(i => i !== id)
                : [...prev, id]
        );
    };

    const selectAll = () => {
        if (selectedIds.length === items.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(items.map(item => item.id));
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!confirm(`선택한 ${selectedIds.length}개의 뉴스를 삭제하시겠습니까?`)) return;
        
        setIsDeleting(true);
        try {
            const result = await batchDeleteAction(selectedIds);
            if (result.success) {
                setSelectedIds([]);
                router.refresh();
            } else {
                alert('삭제 실패: ' + result.error);
            }
        } catch (error) {
            alert('삭제 중 오류 발생: ' + error.message);
        }
        setIsDeleting(false);
    };

    return (
        <div className="border-2 border-gray-300 rounded-xl p-6 bg-gray-50">
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-gray-900">Total Items</span>
                    <span className="text-lg font-bold bg-gray-200 text-gray-900 px-4 py-2 rounded-lg border-2 border-gray-300">{items.length} items</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={selectAll}
                        className="text-lg font-bold bg-gray-200 text-gray-900 px-5 py-2.5 rounded-lg hover:bg-gray-300 transition border-2 border-gray-300"
                    >
                        {selectedIds.length === items.length && items.length > 0 ? '전체 해제' : '전체 선택'}
                    </button>
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handleBatchDelete}
                            disabled={isDeleting}
                            className="text-lg font-bold bg-red-600 text-white px-5 py-2.5 rounded-lg hover:bg-red-700 transition disabled:opacity-50 shadow-sm"
                        >
                            {isDeleting ? '삭제 중...' : `선택 삭제 (${selectedIds.length})`}
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-5 h-[80vh] overflow-y-auto pr-2">
                {items.map(item => (
                    <div key={item.id} className={`bg-white p-6 rounded-xl shadow-sm border-2 ${selectedIds.includes(item.id) ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(item.id)}
                                    onChange={() => toggleSelect(item.id)}
                                    className="w-6 h-6 text-red-600 rounded cursor-pointer"
                                />
                                <span className="text-lg font-bold text-blue-700 uppercase">{item.source}</span>
                                {/* 인기 검색어 관련도 배지 — 점수 높을수록 한국인 검색 수요에 부합(가점). 0점은 배지 없음. */}
                                {item.keywordScore > 0 && (
                                    <span
                                        className={`inline-flex items-center gap-1 text-base font-bold px-3 py-1 rounded-md border-2 ${
                                            item.keywordScore >= 3
                                                ? 'bg-orange-100 text-orange-800 border-orange-300'
                                                : item.keywordScore === 2
                                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                : 'bg-gray-100 text-gray-600 border-gray-200'
                                        }`}
                                        title="인기 검색어 관련도 (한국인의 베트남 검색 수요 기준). 높을수록 위로 정렬됨."
                                    >
                                        🔥 {item.keywordScore}{item.matchedKeyword ? ` · ${item.matchedKeyword}` : ''}
                                    </span>
                                )}
                            </div>
                            <span className="text-lg text-gray-700 font-bold">{item.publishedAt ? new Date(item.publishedAt).toISOString().split('T')[0] : ''}</span>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-4 leading-snug">
                            <Link href={`/admin/news/${item.id}/translate`} className="hover:text-blue-700 hover:underline">
                                {item.translatedTitle || item.title}
                            </Link>
                            {item.translatedTitle && <span className="block text-lg text-gray-700 font-medium mt-2 leading-snug">{item.title}</span>}
                            {!item.translatedTitle && (
                                <span className="inline-block text-base font-bold bg-red-100 text-red-800 px-3 py-1.5 rounded-md ml-2 border-2 border-red-300">
                                    ⚠️ 번역 필요
                                </span>
                            )}
                        </h3>
                        <div className="flex justify-between items-center mt-4 flex-wrap gap-3">
                            <div className="min-w-[220px]">
                                <CategorySelector id={item.id} initialCategory={item.category} />
                            </div>
                            <div className="flex gap-2">
                                {/* 번역 실패 또는 미번역 시 재번역 버튼 표시 */}
                                {!item.translatedTitle && (
                                    <button
                                        onClick={() => handleRetranslate(item.id)}
                                        disabled={translatingId === item.id}
                                        className="text-lg font-bold bg-yellow-500 text-white px-5 py-2.5 rounded-lg hover:bg-yellow-600 transition disabled:opacity-50 shadow-sm"
                                        title="재번역"
                                    >
                                        {translatingId === item.id ? '⏳' : '🔄'}
                                    </button>
                                )}
                                <form action={deleteNewsItemAction}>
                                    <input type="hidden" name="id" value={item.id} />
                                    <button type="submit" className="text-lg font-bold bg-gray-200 text-gray-800 px-5 py-2.5 rounded-lg hover:bg-red-100 hover:text-red-700 transition border-2 border-gray-300" title="Delete">
                                        🗑️
                                    </button>
                                </form>
                                <form action={addToTopAction}>
                                    <input type="hidden" name="id" value={item.id} />
                                    <button type="submit" className="text-lg font-bold bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition shadow-sm">
                                        Select →
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                ))}
                {items.length === 0 && (
                    <p className="text-center text-xl text-gray-700 font-bold py-12">No new items found. Run crawler to fetch news.</p>
                )}
            </div>
        </div>
    );
}
