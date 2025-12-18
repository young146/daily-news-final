'use client';

import { useState } from 'react';

export default function CrawlNewsButton() {
    const [isCrawling, setIsCrawling] = useState(false);
    const [result, setResult] = useState(null);
    const [showResult, setShowResult] = useState(false);

    const handleCrawl = async () => {
        if (!confirm('7개 소스에서 뉴스를 수집합니다. 1-2분 정도 소요됩니다. 진행하시겠습니까?')) return;
        
        setIsCrawling(true);
        setResult(null);
        setShowResult(false);
        
        try {
            const response = await fetch('/api/crawl-news', { method: 'POST' });
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Server error');

            setResult(data);
            setShowResult(true);

        } catch (error) {
            console.error('Crawl failed:', error);
            alert(`뉴스 수집 실패: ${error.message}`);
        }
        setIsCrawling(false);
    };

    const handleClose = () => {
        setShowResult(false);
        window.location.reload();
    };

    const sourceLabels = {
        'VnExpress': 'VnExpress (영문)',
        'VnExpress VN': 'VnExpress (베트남어)',
        'Yonhap News': '연합뉴스',
        'InsideVina': '인사이드비나',
        'TuoiTre': 'Tuổi Trẻ',
        'ThanhNien': 'Thanh Niên'
    };

    return (
        <>
            <button
                onClick={handleCrawl}
                disabled={isCrawling}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50"
                title="7개 소스에서 뉴스 수집"
            >
                {isCrawling ? (
                    <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        수집 중... (1-2분 소요)
                    </>
                ) : '뉴스 수집'}
            </button>

            {showResult && result && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold mb-4 text-center">
                            🎉 뉴스 수집 완료!
                        </h3>
                        
                        <div className="mb-4 p-3 bg-green-50 rounded-lg text-center">
                            <div className="text-3xl font-bold text-green-600">{result.newItems}개</div>
                            <div className="text-sm text-gray-600">새 뉴스 저장됨</div>
                            {result.total > result.newItems && (
                                <div className="text-xs text-gray-400 mt-1">
                                    (총 {result.total}개 중 {result.total - result.newItems}개 중복 제외)
                                </div>
                            )}
                        </div>

                        <div className="border rounded-lg overflow-hidden mb-4">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-3 py-2 text-left">소스</th>
                                        <th className="px-3 py-2 text-right">수집</th>
                                        <th className="px-3 py-2 text-center">상태</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.sources && Object.entries(result.sources).map(([source, count]) => (
                                        <tr key={source} className="border-t">
                                            <td className="px-3 py-2">{sourceLabels[source] || source}</td>
                                            <td className="px-3 py-2 text-right font-medium">{count}개</td>
                                            <td className="px-3 py-2 text-center">
                                                {count > 0 ? (
                                                    <span className="text-green-600">✅</span>
                                                ) : (
                                                    <span className="text-red-500">❌</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <button
                            onClick={handleClose}
                            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
                        >
                            확인 (새로고침)
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
