'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CategorySelector from './category-selector';
import { CardNewsToggle, WorkflowButton, DeleteSelectedNewsButton } from './batch-actions';

export default function SelectedNewsList({ 
    initialTopNews, 
    removeFromTopAction, 
    toggleTopNewsAction,
    todayPublishedCount 
}) {
    const [topNews, setTopNews] = useState(initialTopNews);
    const router = useRouter();

    useEffect(() => {
        setTopNews(initialTopNews);
    }, [initialTopNews]);

    const handleRemoveFromTop = async (formData) => {
        const id = formData.get('id');
        setTopNews(prev => prev.filter(item => item.id !== id));
        await removeFromTopAction(formData);
        router.refresh();
    };

    const handleToggleTopNews = async (formData) => {
        const id = formData.get('id');
        setTopNews(prev => prev.map(item => 
            item.id === id ? { ...item, isTopNews: !item.isTopNews } : item
        ));
        await toggleTopNewsAction(formData);
        router.refresh();
    };

    return (
        <div className="border rounded-lg p-4 bg-white shadow-sm">
            <h2 className="text-xl font-semibold mb-4 flex justify-between items-center text-blue-800">
                <div className="flex items-center gap-2">
                    선정된 뉴스
                    <span className="text-sm font-normal bg-blue-100 text-blue-800 px-2 py-1 rounded">{topNews.length}개</span>
                </div>
                <div className="flex gap-2">
                    <WorkflowButton topNews={topNews} />
                </div>
            </h2>
            <div className="space-y-4 h-[80vh] overflow-y-auto pr-2">
                {topNews.map(item => (
                    <div key={item.id} className={`p-4 rounded border ${item.isTopNews ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-600 uppercase">{item.source}</span>
                                {item.isTopNews && <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded font-bold">★ TOP NEWS</span>}
                            </div>
                            <div className="flex gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded ${item.translationStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                    item.translationStatus === 'DRAFT' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-200 text-gray-600'
                                    }`}>
                                    {item.translationStatus}
                                </span>
                            </div>
                        </div>

                        <h3 className="font-medium text-gray-900 mb-2">
                            <Link href={`/admin/news/${item.id}/translate`} className="hover:text-blue-600 hover:underline flex items-center gap-2 group">
                                {item.translatedTitle || item.title}
                                <span className="opacity-0 group-hover:opacity-100 text-xs text-blue-500">✎ Edit</span>
                            </Link>
                        </h3>

                        <div className="mb-3">
                            <CategorySelector id={item.id} initialCategory={item.category} />
                        </div>

                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-blue-100/50">
                            <div className="flex gap-2 items-center">
                                <CardNewsToggle id={item.id} isCardNews={item.isCardNews} />
                                <form action={handleRemoveFromTop}>
                                    <input type="hidden" name="id" value={item.id} />
                                    <button type="submit" className="text-xs text-red-600 hover:text-red-800 hover:underline">
                                        ← Unselect
                                    </button>
                                </form>
                                <form action={handleToggleTopNews}>
                                    <input type="hidden" name="id" value={item.id} />
                                    <button type="submit" className={`text-xs flex items-center gap-1 ${item.isTopNews ? 'text-yellow-600 font-bold' : 'text-gray-400 hover:text-yellow-500'}`}>
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
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                    {todayPublishedCount > 0 ? (
                        <div className="space-y-2">
                            <div className="text-4xl">✅</div>
                            <p className="text-green-600 font-bold text-lg">오늘 {todayPublishedCount}개 뉴스 발행 완료!</p>
                            <p className="text-gray-500 text-sm">새 뉴스를 선택하려면 왼쪽에서 추가하세요.</p>
                        </div>
                    ) : (
                        <p className="text-gray-500">왼쪽에서 뉴스를 선택하세요.</p>
                    )}
                </div>
            )}
        </div>
    );
}
