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
        setIsCrawling(true);
        setResult(null);
        setShowResult(false);
        
        try {
            const response = await fetch('/api/crawl-news', { 
                method: 'POST',
                keepalive: true // 백그라운드 실행
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Server error');

            setResult(data);
            setShowResult(true);

        } catch (error) {
            console.error('Crawl failed:', error);
            alert(`뉴스 수집 실패: ${error.message}`);
        } finally {
            setIsCrawling(false);
        }
    };

    const handleClose = () => {
        setShowResult(false);
        window.location.reload();
    };

    const sourceLabels = {
        'VnExpress': 'VnExpress (영문)',
        'VnExpress VN': 'VnExpress (베트남어)',
        'VnExpress Economy': 'VnExpress Economy (경제)',
        'VnExpress Real Estate': 'VnExpress Real Estate (부동산)',
        'VnExpress Travel': 'VnExpress Travel (여행)',
        'VnExpress Health': 'VnExpress Health (건강)',
        'Cafef': 'Cafef (경제 전문)',
        'Cafef Real Estate': 'Cafef Real Estate (부동산)',
        'Yonhap News': 'Yonhap (연합뉴스)',
        'InsideVina': 'InsideVina',
        'TuoiTre': 'TuoiTre (Tuổi Trẻ)',
        'ThanhNien': 'ThanhNien (Thanh Niên)',
        'Saigoneer': 'Saigoneer (음식/여행)',
        'SoraNews24': 'SoraNews24 (펫/여행)',
        'The Dodo': 'The Dodo (펫)',
        'PetMD': 'PetMD (펫)',
        'Bon Appétit': 'Bon Appétit (음식/레시피)',
        'Health': 'Health (건강/웰니스)'
    };

    return (
        <>
            <button
                onClick={handleCrawl}
                disabled={isCrawling}
                className={`${
                    isCrawling 
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700'
                } text-white px-4 py-2 rounded transition flex items-center gap-2`}
            >
                {isCrawling ? (
                    <>
                        <span className="animate-spin">⏳</span>
                        뉴스 수집 중...
                    </>
                ) : (
                    <>
                        📰 전체 뉴스 수집
                    </>
                )}
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
