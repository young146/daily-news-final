'use client';

import { useRef, useState } from 'react';

export default function CardNewsSimple({ data, mode = 'preview' }) {
    const { topNews, weather, rates } = data;
    const cardRef = useRef(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [publishResult, setPublishResult] = useState(null);
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    const generateCanvas = async () => {
        if (!cardRef.current) return null;
        window.scrollTo(0, 0);
        
        // Wait for fonts to load
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
        await new Promise(resolve => setTimeout(resolve, 800));

        const html2canvas = (await import('html2canvas')).default;
        const images = cardRef.current.querySelectorAll('img');
        const originalSrcs = [];

        await Promise.all(Array.from(images).map(async (img, i) => {
            originalSrcs[i] = img.src;
            if (img.src.startsWith('/') || img.src.includes(window.location.origin)) return;
            try {
                const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(img.src)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy fetch failed');
                const blob = await response.blob();
                img.src = URL.createObjectURL(blob);
            } catch (e) {
                console.warn('Failed to proxy image:', img.src);
            }
        }));

        const canvas = await html2canvas(cardRef.current, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#0f172a',
            logging: false,
            scrollY: 0,
            windowWidth: 1200,
            windowHeight: 630,
            onclone: (clonedDoc) => {
                // Force Noto Sans KR font in cloned document
                const style = clonedDoc.createElement('style');
                style.textContent = `
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
                    * { 
                        font-family: "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif !important; 
                    }
                `;
                clonedDoc.head.appendChild(style);
            }
        });

        images.forEach((img, i) => {
            if (originalSrcs[i]) {
                URL.revokeObjectURL(img.src);
                img.src = originalSrcs[i];
            }
        });
        return canvas;
    };

    const handleDownloadImage = async () => {
        setIsGenerating(true);
        try {
            const canvas = await generateCanvas();
            if (canvas) {
                const image = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.href = image;
                link.download = `xinchao-news-${new Date().toISOString().split('T')[0]}.png`;
                link.click();
            }
        } catch (error) {
            alert(`Failed: ${error.message}`);
        }
        setIsGenerating(false);
    };

    const handlePublishToWordPress = async () => {
        if (!confirm('카드 엽서를 WordPress에 게시하시겠습니까?')) return;
        
        setIsGenerating(true);
        setPublishResult(null);
        
        try {
            const canvas = await generateCanvas();
            if (!canvas) {
                throw new Error('이미지 생성에 실패했습니다');
            }
            
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            
            if (!blob) {
                throw new Error('이미지 변환에 실패했습니다');
            }
            
            const formData = new FormData();
            formData.append('image', blob, 'card-news.jpg');
            
            const response = await fetch('/api/publish-card-news', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                setPublishResult({
                    success: true,
                    terminalUrl: result.terminalUrl,
                    imageUrl: result.imageUrl
                });
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error) {
            setPublishResult({ success: false, error: error.message });
            alert(`게시 실패: ${error.message}`);
        }
        
        setIsGenerating(false);
    };

    return (
        <div className={mode === 'print' ? "w-[1200px] h-[630px] overflow-hidden m-0 p-0" : "flex flex-col items-center py-8 px-4 min-h-screen"}>
            <style jsx global>{`
                @media print {
                    @page { size: landscape; margin: 0; }
                    body { margin: 0; padding: 0; background: white; overflow: hidden; }
                    body * { visibility: hidden; }
                    #capture-target, #capture-target * { visibility: visible; }
                    #capture-target {
                        position: fixed; left: 0; top: 0;
                        width: 100% !important; height: auto !important;
                        max-height: 100vh !important; margin: 0;
                        box-shadow: none !important;
                        print-color-adjust: exact; -webkit-print-color-adjust: exact;
                    }
                    button { display: none !important; }
                }
            `}</style>

            <div 
                id="capture-target" 
                ref={cardRef} 
                className="relative overflow-hidden"
                style={{ 
                    width: '1200px', 
                    height: '630px', 
                    backgroundColor: '#0f172a',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    fontFamily: 'var(--font-noto-sans-kr), "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
                }}
            >
                {/* Background Image with Overlay - Full Coverage */}
                <div className="absolute inset-0">
                    {topNews?.imageUrl ? (
                        <img
                            src={topNews.imageUrl}
                            alt="Top News"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(topNews.imageUrl)}`;
                                if (e.target.src !== window.location.origin + proxyUrl) e.target.src = proxyUrl;
                            }}
                        />
                    ) : (
                        <div className="w-full h-full" style={{ backgroundColor: '#1e293b' }} />
                    )}
                    <div 
                        className="absolute inset-0" 
                        style={{ 
                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.85) 100%)' 
                        }} 
                    />
                </div>

                {/* Content Container */}
                <div className="relative z-10 h-full flex flex-col">
                    
                    {/* Top Header Bar */}
                    <div className="px-10 py-6 flex justify-between items-center">
                        <div className="flex items-center gap-6">
                            <div className="flex flex-col">
                                <span 
                                    className="font-serif italic text-3xl leading-none" 
                                    style={{ color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
                                >
                                    Xin Chao Vietnam
                                </span>
                                <span 
                                    className="text-base font-bold tracking-[0.3em] uppercase mt-1" 
                                    style={{ color: '#fb923c' }}
                                >
                                    오늘의 뉴스
                                </span>
                            </div>
                        </div>
                        <div 
                            className="px-5 py-2 rounded-full text-base font-bold"
                            style={{ 
                                color: '#ffffff', 
                                backgroundColor: 'rgba(251, 146, 60, 0.9)',
                                boxShadow: '0 4px 15px rgba(251, 146, 60, 0.4)'
                            }}
                        >
                            {today}
                        </div>
                    </div>

                    {/* Main Content - Hero News */}
                    <div className="flex-1 px-10 flex flex-col justify-center pb-24">
                        {/* Category Badge */}
                        {topNews?.category && (
                            <div 
                                className="inline-block px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider mb-4 w-fit"
                                style={{ 
                                    backgroundColor: '#fb923c', 
                                    color: '#ffffff',
                                    boxShadow: '0 4px 15px rgba(251, 146, 60, 0.3)'
                                }}
                            >
                                {topNews.category}
                            </div>
                        )}
                        
                        {/* Main Title */}
                        <h1 
                            className="text-5xl font-black leading-tight mb-5 max-w-[1000px] line-clamp-2"
                            style={{ 
                                color: '#ffffff', 
                                textShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                lineHeight: '1.25'
                            }}
                        >
                            {topNews?.translatedTitle || topNews?.title || "오늘의 주요 뉴스"}
                        </h1>
                        
                        {/* Summary */}
                        <p 
                            className="text-xl leading-relaxed max-w-[900px] line-clamp-2"
                            style={{ 
                                color: '#e2e8f0', 
                                textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                            }}
                        >
                            {topNews?.translatedSummary || topNews?.summary || ""}
                        </p>
                    </div>
                </div>

                {/* Wave Separator */}
                <div className="absolute bottom-[70px] left-0 w-full z-20 leading-[0]">
                    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="w-full h-[50px]" style={{ fill: '#ffffff' }}>
                        <path d="M0,30 C200,60 400,0 600,30 C800,60 1000,0 1200,30 L1200,60 L0,60 Z" />
                    </svg>
                    {/* Orange Accent Wave */}
                    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="absolute top-[-8px] left-0 w-full h-[50px] -z-10" style={{ fill: '#fb923c', opacity: 0.9 }}>
                        <path d="M0,30 C200,60 400,0 600,30 C800,60 1000,0 1200,30 L1200,60 L0,60 Z" />
                    </svg>
                </div>

                {/* Bottom Footer - White Band */}
                <div 
                    className="absolute bottom-0 left-0 right-0 h-[70px] px-10 flex justify-between items-center z-30"
                    style={{ backgroundColor: '#ffffff' }}
                >
                    {/* Logo */}
                    <div className="flex items-center gap-4">
                        <img src="/logo-full.png" alt="Xin Chao Vietnam" className="h-10 w-auto object-contain" />
                    </div>

                    {/* Weather & Rates - Compact */}
                    <div className="flex items-center gap-8">
                        {/* Weather */}
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">{weather ? getWeatherIcon(weather.code) : '☀️'}</span>
                            <div className="flex flex-col">
                                <span className="text-xl font-black leading-none" style={{ color: '#0f172a' }}>
                                    {weather?.temp ?? '--'}°C
                                </span>
                                <span className="text-xs font-medium" style={{ color: '#64748b' }}>Seoul</span>
                            </div>
                        </div>

                        <div className="w-px h-8" style={{ backgroundColor: '#e2e8f0' }}></div>

                        {/* USD Rate */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#64748b', backgroundColor: '#f1f5f9' }}>USD</span>
                            <span className="text-lg font-black" style={{ color: '#0f172a' }}>
                                {rates?.usdVnd?.toLocaleString() ?? '---'}
                            </span>
                        </div>

                        {/* KRW Rate */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: '#64748b', backgroundColor: '#f1f5f9' }}>KRW</span>
                            <span className="text-lg font-black" style={{ color: '#0f172a' }}>
                                {rates?.krwVnd?.toLocaleString() ?? '---'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {mode !== 'print' && (
                <div className="mt-6 flex flex-col items-center gap-4">
                    <div className="flex gap-4">
                        <button 
                            onClick={handleDownloadImage} 
                            disabled={isGenerating} 
                            className="px-5 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-bold"
                        >
                            📥 이미지 다운로드
                        </button>
                        <button 
                            onClick={handlePublishToWordPress} 
                            disabled={isGenerating}
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-base font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isGenerating ? (
                                <>
                                    <span className="animate-spin">⏳</span>
                                    게시 중...
                                </>
                            ) : (
                                <>
                                    📤 WordPress에 카드 엽서 게시
                                </>
                            )}
                        </button>
                    </div>
                    
                    {publishResult && publishResult.success && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                            <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg mx-4">
                                <div className="flex flex-col gap-5">
                                    <div className="text-center">
                                        <span className="text-4xl">🎉</span>
                                        <p className="text-2xl font-bold text-green-700 mt-3">게시 완료!</p>
                                        <p className="text-gray-500 mt-1">뉴스 터미널 대표이미지가 업데이트되었습니다</p>
                                    </div>
                                    
                                    <div className="bg-blue-50 p-5 rounded-xl border-2 border-blue-300">
                                        <p className="text-center text-gray-800 font-bold mb-4 text-lg">
                                            📮 SNS 공유용 URL
                                        </p>
                                        
                                        <div 
                                            onClick={() => {
                                                const dateParam = `${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`;
                                                const shareUrl = `https://chaovietnam.co.kr/daily-news-terminal/?v=${dateParam}`;
                                                navigator.clipboard.writeText(shareUrl);
                                                const btn = document.getElementById('copy-success-msg');
                                                if (btn) {
                                                    btn.textContent = '✅ 복사됨!';
                                                    setTimeout(() => { btn.textContent = '📋 클릭하여 복사'; }, 2000);
                                                }
                                            }}
                                            className="flex items-center gap-3 p-4 bg-white rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border-2 border-blue-400"
                                        >
                                            <span className="text-blue-700 font-mono text-sm flex-1 break-all font-bold">
                                                https://chaovietnam.co.kr/daily-news-terminal/?v={`${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`}
                                            </span>
                                            <span id="copy-success-msg" className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg font-bold whitespace-nowrap">
                                                📋 클릭하여 복사
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-3">
                                        <a href={publishResult.terminalUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200 transition-colors">
                                            🔗 미리보기
                                        </a>
                                        <button 
                                            onClick={() => setPublishResult(null)}
                                            className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors"
                                        >
                                            ✓ 확인
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function getWeatherIcon(code) {
    if (!code) return '☀️';
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 49) return '🌫️';
    if (code <= 69) return '🌧️';
    if (code <= 79) return '❄️';
    if (code <= 99) return '⛈️';
    return '☀️';
}
