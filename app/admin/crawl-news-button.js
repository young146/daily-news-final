'use client';

import { useState, useEffect } from 'react';

export default function CrawlNewsButton() {
    const [isCrawling, setIsCrawling] = useState(false);
    const [result, setResult] = useState(null);
    const [showResult, setShowResult] = useState(false);

    // 크롤링 중 페이지 이탈 방지 경고
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isCrawling) {
                e.preventDefault();
                e.returnValue = "뉴스 수집이 진행 중입니다. 페이지를 떠나도 작업은 백그라운드에서 계속됩니다.";
                return e.returnValue;
            }
        };

        if (isCrawling) {
            window.addEventListener("beforeunload", handleBeforeUnload);
        }

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [isCrawling]);

    const handleCrawl = async () => {
        alert('⚠️ 전체 크롤링은 Vercel 타임아웃(60초) 제한으로 인해 비활성화되었습니다.\n\n대신 사용 방법:\n\n1. 우측 상단 "설정" 버튼 클릭\n2. "소스별 크롤링" 섹션에서 원하는 소스만 개별적으로 크롤링\n3. 자동 크롤링은 매일 밤 11시(베트남 시간)에 실행됩니다\n\n소스별 크롤링은 각각 10-20초 내에 완료됩니다.');
        return;
        
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
                className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500 transition flex items-center gap-2"
                title="전체 크롤링은 타임아웃 제한으로 비활성화됨 - 소스별 크롤링을 사용하세요"
            >
                ⚠️ 전체 크롤링 (비활성화)
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
