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
        <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                    <span className="font-semibold">Total Items</span>
                    <span className="text-sm font-normal bg-gray-200 px-2 py-1 rounded">{items.length} items</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={selectAll}
                        className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 transition"
                    >
                        {selectedIds.length === items.length && items.length > 0 ? '전체 해제' : '전체 선택'}
                    </button>
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handleBatchDelete}
                            disabled={isDeleting}
                            className="text-xs bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition disabled:opacity-50"
                        >
                            {isDeleting ? '삭제 중...' : `선택 삭제 (${selectedIds.length})`}
                        </button>
                    )}
                </div>
            </div>
            <div className="space-y-4 h-[80vh] overflow-y-auto pr-2">
                {items.map(item => (
                    <div key={item.id} className={`bg-white p-4 rounded shadow-sm border ${selectedIds.includes(item.id) ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.includes(item.id)}
                                    onChange={() => toggleSelect(item.id)}
                                    className="w-4 h-4 text-red-600 rounded cursor-pointer"
                                />
                                <span className="text-xs font-bold text-blue-600 uppercase">{item.source}</span>
                            </div>
                            <span className="text-xs text-gray-500">{item.publishedAt ? new Date(item.publishedAt).toISOString().split('T')[0] : ''}</span>
                        </div>
                        <h3 className="font-medium text-gray-900 mb-2">
                            <Link href={`/admin/news/${item.id}/translate`} className="hover:text-blue-600 hover:underline">
                                {item.translatedTitle || item.title}
                            </Link>
                            {item.translatedTitle && <span className="block text-xs text-gray-500 font-normal mt-1">{item.title}</span>}
                            {!item.translatedTitle && (
                                <span className="inline-block text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded ml-2">
                                    ⚠️ 번역 필요
                                </span>
                            )}
                        </h3>
                        <div className="flex justify-between items-center mt-2">
                            <div className="w-40">
                                <CategorySelector id={item.id} initialCategory={item.category} />
                            </div>
                            <div className="flex gap-2">
                                {/* 번역 실패 또는 미번역 시 재번역 버튼 표시 */}
                                {!item.translatedTitle && (
                                    <button
                                        onClick={() => handleRetranslate(item.id)}
                                        disabled={translatingId === item.id}
                                        className="text-sm bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600 transition disabled:opacity-50"
                                        title="재번역"
                                    >
                                        {translatingId === item.id ? '⏳' : '🔄'}
                                    </button>
                                )}
                                <form action={deleteNewsItemAction}>
                                    <input type="hidden" name="id" value={item.id} />
                                    <button type="submit" className="text-sm bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-red-100 hover:text-red-600 transition" title="Delete">
                                        🗑️
                                    </button>
                                </form>
                                <form action={addToTopAction}>
                                    <input type="hidden" name="id" value={item.id} />
                                    <button type="submit" className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition">
                                        Select →
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                ))}
                {items.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No new items found. Run crawler to fetch news.</p>
                )}
            </div>
        </div>
    );
}
