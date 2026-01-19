'use client';

import { useState, useEffect } from 'react';

export default function CrawlNewsButton() {
    const [isCrawling, setIsCrawling] = useState(false);
    const [result, setResult] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });

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
        setResult({ newItems: 0, total: 0, sources: {} });
        setShowResult(true); // 즉시 결과창 표시
        
        const sources = [
            'vnexpress', 'vnexpress-vn', 'vnexpress-economy', 'vnexpress-realestate',
            'vnexpress-travel', 'vnexpress-health', 'cafef', 'cafef-realestate',
            'yonhap', 'insidevina', 'tuoitre', 'thanhnien',
            'saigoneer', 'soranews24', 'thedodo', 'petmd', 'bonappetit', 'health'
        ];
        
        const results = {};
        let totalItems = 0;
        
        setProgress({ current: 0, total: sources.length });
        
        // 18개 소스를 순차 크롤링 - 에러 나도 절대 멈추지 않음!
        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            const sourceName = sourceLabels[capitalizeSource(source)] || source;
            
            try {
                setProgress({ current: i + 1, total: sources.length });
                
                // 크롤링 중 표시
                results[sourceName] = '⏳';
                setResult({
                    newItems: totalItems,
                    total: totalItems,
                    sources: { ...results }
                });
                
                try {
                    const response = await fetch('/api/crawl-source', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ source }),
                        keepalive: true
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const count = data.count || 0;
                        results[sourceName] = count;
                        totalItems += count;
                    } else {
                        results[sourceName] = '❌ 실패';
                    }
                } catch (err) {
                    console.error(`[${source}] Fetch error:`, err);
                    results[sourceName] = '❌ 에러';
                }
                
                // 실시간 업데이트
                setResult({
                    newItems: totalItems,
                    total: totalItems,
                    sources: { ...results }
                });
            } catch (err) {
                // 만약의 경우를 대비한 이중 안전장치
                console.error(`[${source}] Unexpected error:`, err);
                results[sourceName] = '❌ 예외';
                setResult({
                    newItems: totalItems,
                    total: totalItems,
                    sources: { ...results }
                });
            }
        }
        
        // 모든 크롤링 완료
        setIsCrawling(false);
    };
    
    // Helper function
    const capitalizeSource = (source) => {
        const mapping = {
            'vnexpress': 'VnExpress',
            'vnexpress-vn': 'VnExpress VN',
            'vnexpress-economy': 'VnExpress Economy',
            'vnexpress-realestate': 'VnExpress Real Estate',
            'vnexpress-travel': 'VnExpress Travel',
            'vnexpress-health': 'VnExpress Health',
            'cafef': 'Cafef',
            'cafef-realestate': 'Cafef Real Estate',
            'yonhap': 'Yonhap News',
            'insidevina': 'InsideVina',
            'tuoitre': 'TuoiTre',
            'thanhnien': 'ThanhNien',
            'saigoneer': 'Saigoneer',
            'soranews24': 'SoraNews24',
            'thedodo': 'The Dodo',
            'petmd': 'PetMD',
            'bonappetit': 'Bon Appétit',
            'health': 'Health'
        };
        return mapping[source] || source;
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
                        뉴스 수집 중... ({progress.current}/{progress.total})
                    </>
                ) : (
                    <>
                        📰 전체 뉴스 수집 (18개 소스)
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
                                            <td className="px-3 py-2">{source}</td>
                                            <td className="px-3 py-2 text-right font-medium">
                                                {typeof count === 'number' ? `${count}개` : count}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {count === '⏳' ? (
                                                    <span className="text-blue-500">⏳</span>
                                                ) : typeof count === 'number' && count > 0 ? (
                                                    <span className="text-green-600">✅</span>
                                                ) : typeof count === 'string' && count.includes('❌') ? (
                                                    <span className="text-red-500">❌</span>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
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
