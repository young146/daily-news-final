'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveTranslation, completeReview } from './actions';

export default function TranslationForm({ newsItem, nextId }) {
    const router = useRouter();
    const [showPreview, setShowPreview] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishMessage, setPublishMessage] = useState('');

    // 다음 기사를 백그라운드로 미리 로드 — Confirm & Complete 후 페이지 SSR 대기 시간 제거
    useEffect(() => {
        if (nextId) {
            router.prefetch(`/admin/news/${nextId}/translate`);
        }
    }, [nextId, router]);

    // 로딩 상태일 때 전역 cursor 변경 (모든 요소에 wait 표시)
    useEffect(() => {
        if (isPublishing) {
            document.body.classList.add('app-loading');
        } else {
            document.body.classList.remove('app-loading');
        }
        return () => document.body.classList.remove('app-loading');
    }, [isPublishing]);

    const [formData, setFormData] = useState({
        translatedTitle: newsItem.translatedTitle || '',
        translatedSummary: newsItem.translatedSummary || '',
        translatedContent: newsItem.translatedContent || '',
        imageUrl: newsItem.imageUrl || ''
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePreview = (e) => {
        e.preventDefault();
        setShowPreview(true);
    };

    const closePreview = () => {
        setShowPreview(false);
    };

    const handleComplete = async (e) => {
        e.preventDefault();
        setIsPublishing(true);
        setPublishMessage('Saving & Completing... ⏳');

        const formDataObj = new FormData();
        formDataObj.append('id', newsItem.id);
        formDataObj.append('translatedTitle', formData.translatedTitle);
        formDataObj.append('translatedSummary', formData.translatedSummary);
        formDataObj.append('translatedContent', formData.translatedContent);
        formDataObj.append('imageUrl', formData.imageUrl);

        try {
            const result = await completeReview(formDataObj);

            if (result.success) {
                setPublishMessage('Completed! ✅ Moving to next...');
                setTimeout(() => {
                    if (nextId) {
                        router.push(`/admin/news/${nextId}/translate`);
                    } else {
                        router.push('/admin?readyToPublish=true');
                    }
                    router.refresh();
                }, 1000);
            } else {
                setPublishMessage(`Error: ${result.error}`);
                setIsPublishing(false);
            }
        } catch (error) {
            setPublishMessage('An unexpected error occurred.');
            setIsPublishing(false);
        }
    };

    return (
        <>
            <form action={saveTranslation} className="space-y-6">
                <input type="hidden" name="id" value={newsItem.id} />

                {/* Image Handling */}
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">News Image URL</label>
                    {formData.imageUrl && (
                        <div className="mb-2">
                            <img src={formData.imageUrl} alt="News Image" className="w-full h-48 object-cover rounded border" />
                        </div>
                    )}
                    <input
                        type="text"
                        name="imageUrl"
                        value={formData.imageUrl}
                        onChange={handleChange}
                        className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm text-gray-600"
                        placeholder="Enter image URL..."
                    />
                </div>

                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-bold text-gray-700">Translated Title (Korean)</label>
                        <button
                            type="button"
                            onClick={async () => {
                                if (!confirm('This will overwrite current fields with AI generation. Continue?')) return;
                                setIsPublishing(true);
                                setPublishMessage('Generating Translation... 🤖');
                                try {
                                    const { generateTranslationAction } = await import('./actions');
                                    const result = await generateTranslationAction(newsItem.id);
                                    if (result.success) {
                                        setFormData(prev => ({
                                            ...prev,
                                            translatedTitle: result.data.translatedTitle,
                                            translatedSummary: result.data.translatedSummary,
                                            translatedContent: result.data.translatedContent
                                        }));
                                        setPublishMessage('Generated! ✨');
                                        setTimeout(() => setPublishMessage(''), 2000);
                                    } else {
                                        setPublishMessage('Error generating.');
                                    }
                                } catch (e) {
                                    console.error(e);
                                    setPublishMessage('Error generating.');
                                }
                                setIsPublishing(false);
                            }}
                            className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200 flex items-center gap-1"
                        >
                            🤖 Auto-Generate (자동 번역/요약 생성)
                        </button>
                    </div>
                    <input
                        type="text"
                        name="translatedTitle"
                        value={formData.translatedTitle}
                        onChange={handleChange}
                        className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Enter Korean title..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Translated Summary (For Daily Site)</label>
                    <textarea
                        name="translatedSummary"
                        value={formData.translatedSummary}
                        onChange={handleChange}
                        rows={4}
                        className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Enter Korean summary..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Translated Body (For Main Site)</label>
                    <textarea
                        name="translatedContent"
                        value={formData.translatedContent}
                        onChange={handleChange}
                        rows={12}
                        className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                        placeholder="Enter Korean body content (HTML/Markdown)..."
                    />
                </div>

                <div className="flex gap-4 pt-4 border-t items-center">
                    <button
                        type="submit"
                        className="text-gray-500 hover:text-gray-700 text-sm font-medium px-4"
                        onClick={(e) => {
                            // Let the form submit naturally to saveTranslation, but we might want to show a toast
                            // For now, the server action revalidates, so the page might reload or just stay.
                            // We can add a simple alert or toast here if needed.
                        }}
                    >
                        Save Draft (임시 저장)
                    </button>
                    <button
                        type="button"
                        onClick={async (e) => {
                            e.preventDefault();
                            if (confirm('Skip this item? It will be unselected and moved back to Collected News.')) {
                                setIsPublishing(true);  // ← 즉시 cursor wait + 버튼 비활성화
                                const { skipItemAction } = await import('./actions');
                                await skipItemAction(newsItem.id);
                                if (nextId) {
                                    router.push(`/admin/news/${nextId}/translate`);
                                } else {
                                    router.push('/admin');
                                }
                            }
                        }}
                        className="bg-gray-100 text-gray-600 px-4 py-3 rounded hover:bg-gray-200 font-medium"
                    >
                        {nextId ? 'Skip to Next →' : 'Skip & Back ←'}
                    </button>
                    <button
                        onClick={handlePreview}
                        className="flex-1 bg-blue-600 text-white py-3 rounded hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
                    >
                        👁️ Preview & Complete (미리보기 및 완료)
                    </button>
                </div>
            </form>

            {/* Preview Modal */}
            {showPreview && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h2 className="text-xl font-bold text-gray-800">Preview News</h2>
                            <button onClick={closePreview} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                        </div>

                        <div className="p-8 overflow-y-auto flex-1 bg-white">
                            <article className="max-w-2xl mx-auto">
                                <h1 className="text-3xl font-bold mb-4 text-gray-900 leading-tight">{formData.translatedTitle}</h1>

                                {/* Summary Preview */}
                                <div className="bg-gray-50 p-4 rounded-lg mb-6 border-l-4 border-blue-500">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Summary</h3>
                                    <p className="text-gray-700 font-medium">{formData.translatedSummary}</p>
                                </div>

                                {formData.imageUrl && (
                                    <img src={formData.imageUrl} alt={formData.translatedTitle} className="w-full h-auto rounded-lg mb-8 shadow-sm" />
                                )}

                                <div
                                    className="prose prose-lg max-w-none text-gray-800"
                                    dangerouslySetInnerHTML={{ 
                                        __html: formData.imageUrl 
                                            // Featured Image가 있으면, 본문의 첫 번째 img 태그만 제거
                                            ? formData.translatedContent.replace(/^\s*(<p[^>]*>)?\s*<img[^>]*>\s*(<\/p>)?/i, '')
                                            : formData.translatedContent
                                    }}
                                />

                                <div className="mt-8 pt-8 border-t text-sm text-gray-500">
                                    <p>Original Source: {newsItem.source}</p>
                                </div>
                            </article>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                            <div className="text-blue-600 font-medium animate-pulse">
                                {publishMessage}
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={closePreview}
                                    disabled={isPublishing}
                                    className="px-6 py-2 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 disabled:opacity-50"
                                >
                                    Edit Again (수정하기)
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={isPublishing}
                                    className={`px-6 py-2 rounded text-white font-bold flex items-center gap-2 ${isPublishing ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                                >
                                    {isPublishing ? 'Saving...' : '✅ Confirm & Complete (검토 완료)'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
