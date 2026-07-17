'use client';

import { useRef, useState } from 'react';
import { SHARE_TARGETS, withShareUtm } from '@/lib/share-utm';

export default function CardNewsPreviewMars({ data, mode = 'preview' }) {
    const { topNews, cardNewsItems, weather, rates } = data;
    const cardRef = useRef(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [publishResult, setPublishResult] = useState(null);
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    const generateCanvas = async () => {
        if (!cardRef.current) return null;
        // 1. Scroll to top and WAIT for layout to settle (Fixes text clipping/shifting)
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay is crucial

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
            scale: 3, // 3x Resolution (Very Sharp)
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            scrollY: 0, // Force capture from top
            windowWidth: document.documentElement.offsetWidth,
            windowHeight: document.documentElement.offsetHeight
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
                link.download = `daily-news-mars-${new Date().toISOString().split('T')[0]}.png`;
                link.click();
            }
        } catch (error) {
            alert(`Failed: ${error.message}`);
        }
        setIsGenerating(false);
    };

    const handleDownloadPDF = async () => {
        setIsGenerating(true);
        try {
            const canvas = await generateCanvas();
            if (canvas) {
                const { jsPDF } = await import('jspdf');
                const imgData = canvas.toDataURL('image/png');

                // Calculate PDF dimensions to match Image Aspect Ratio (No Distortion)
                // We use A4 width (297mm) as a base, and calculate height accordingly.
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const ratio = imgWidth / imgHeight;

                const pdfWidth = 297; // A4 Landscape Width in mm
                const pdfHeight = pdfWidth / ratio; // Calculated Height to maintain aspect ratio

                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: [pdfWidth, pdfHeight]
                });

                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

                // Add a clickable link over the entire PDF page
                pdf.link(0, 0, pdfWidth, pdfHeight, { url: 'http://localhost:3000' });

                pdf.save(`daily-news-mars-${new Date().toISOString().split('T')[0]}.pdf`);
            }
        } catch (error) {
            alert(`Failed: ${error.message}`);
        }
        setIsGenerating(false);
    };

    const handleNativePrint = () => {
        window.print();
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
        <div className={mode === 'print' ? "w-[1200px] h-[630px] overflow-hidden m-0 p-0" : "flex flex-col items-center"}>
            {/* Print Styles */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: landscape;
                        margin: 0;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        background: white;
                        overflow: hidden; /* Prevent extra pages */
                    }
                    /* Hide everything by default */
                    body * {
                        visibility: hidden;
                    }
                    /* Show only the capture target and its children */
                    #capture-target, #capture-target * {
                        visibility: visible;
                    }
                    /* Position the card to fit exactly one page */
                    #capture-target {
                        position: fixed;
                        left: 0;
                        top: 0;
                        width: 100% !important;
                        height: auto !important;
                        max-height: 100vh !important;
                        margin: 0;
                        box-shadow: none !important;
                        print-color-adjust: exact;
                        -webkit-print-color-adjust: exact;
                        page-break-inside: avoid;
                        page-break-after: avoid;
                        page-break-before: avoid;
                    }
                    /* Hide buttons specifically */
                    button {
                        display: none !important;
                    }
                }
            `}</style>

            {/* --- CARD CONTAINER MARS (Mars Explorer Style) --- */}
            {/* Explicit styles for ALL colors to prevent 'lab' error */}
            <div id="capture-target" ref={cardRef} className="w-[1200px] h-[630px] flex flex-col overflow-hidden relative" style={{ backgroundColor: '#ffffff', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>

                {/* === TOP CONTENT SECTION (Dark & Immersive) === */}
                <div className="flex-1 flex relative z-10" style={{ paddingBottom: '40px' }}> {/* Padding for wave */}

                    {/* Left: Top News (60%) */}
                    <div className="w-[60%] relative h-full">
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
                                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1f2937', color: '#6b7280' }}>No Image</div>
                            )}
                            {/* Dark Gradient Overlay */}
                            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.9) 100%)' }} />
                        </div>

                        {/* Header Brand (Overlay) */}
                        <div className="absolute top-8 left-8 flex flex-col z-20">
                            <span className="font-serif italic text-2xl leading-none" style={{ color: '#ffffff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>Xin Chao</span>
                            <span className="text-sm font-bold tracking-[0.2em] uppercase" style={{ color: '#fb923c', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>Today News</span>
                        </div>

                        {/* Date Badge */}
                        <div className="absolute top-8 right-8 px-4 py-1.5 rounded-full text-sm font-medium" style={{ color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {today}
                        </div>

                        {/* Main Title */}
                        <div className="absolute bottom-12 left-0 w-full px-10 pb-4 z-20" style={{ color: '#ffffff' }}>
                            <h1 className="text-5xl font-bold leading-tight mb-4 line-clamp-3" style={{ textShadow: '0 4px 6px rgba(0,0,0,0.5)' }}>
                                {topNews?.translatedTitle || topNews?.title || "Top News Title Here"}
                            </h1>
                            <p className="text-xl line-clamp-2 max-w-3xl mb-6" style={{ color: '#e5e7eb', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                {topNews?.translatedSummary || topNews?.summary || "Summary of the top news will appear here."}
                            </p>
                        </div>
                    </div>

                    {/* Right: Grid (40%) - Dark Theme */}
                    <div className="w-[40%] p-6 grid grid-cols-2 grid-rows-2 gap-4" style={{ backgroundColor: '#0f172a' }}>
                        {cardNewsItems.map((item) => (
                            <div key={item.id} className="relative rounded-xl overflow-hidden border group" style={{ backgroundColor: '#1e293b', borderColor: '#334155' }}>
                                <div className="h-28 relative overflow-hidden">
                                    {item.imageUrl ? (
                                        <img
                                            src={item.imageUrl}
                                            alt=""
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            onError={(e) => {
                                                const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(item.imageUrl)}`;
                                                if (e.target.src !== window.location.origin + proxyUrl) e.target.src = proxyUrl;
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full" style={{ backgroundColor: '#334155' }} />
                                    )}
                                    <span className="absolute top-0 left-0 text-[10px] font-bold px-2 py-1 rounded-br-lg" style={{ backgroundColor: '#f97316', color: '#ffffff' }}>
                                        {item.category}
                                    </span>
                                </div>
                                <div className="p-3">
                                    <h4 className="text-sm font-bold leading-snug line-clamp-2 mb-1 transition-colors" style={{ color: '#ffffff' }}>
                                        {item.translatedTitle || item.title}
                                    </h4>
                                </div>
                            </div>
                        ))}
                        {/* Fillers */}
                        {[...Array(Math.max(0, 4 - cardNewsItems.length))].map((_, i) => (
                            <div key={i} className="rounded-xl border-2 border-dashed flex items-center justify-center text-sm" style={{ borderColor: '#334155', color: '#475569' }}>
                                + Add News
                            </div>
                        ))}
                    </div>
                </div>

                {/* === WAVE SEPARATOR === */}
                <div className="absolute bottom-[100px] left-0 w-full z-20 leading-[0]">
                    <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="w-full h-[80px]" style={{ fill: '#ffffff', filter: 'drop-shadow(0 -4px 6px rgba(0,0,0,0.1))' }}>
                        <path d="M0,0 C300,60 600,60 1200,0 L1200,120 L0,120 Z" />
                    </svg>
                    {/* Orange Accent Line */}
                    <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="absolute top-[-10px] left-0 w-full h-[80px] -z-10 opacity-80" style={{ fill: '#f97316' }}>
                        <path d="M0,10 C300,70 600,70 1200,10 L1200,120 L0,120 Z" />
                    </svg>
                </div>

                {/* === FOOTER (Clean White) === */}
                <div className="h-[100px] relative z-30 px-10 flex items-center justify-between" style={{ backgroundColor: '#ffffff' }}>

                    {/* Left: Logo */}
                    <div className="flex items-center">
                        <img src="/logo-full.png" alt="Xin Chao Vietnam" className="h-16 w-auto object-contain" />
                    </div>

                    {/* Right: Info (Horizontal) */}
                    <div className="flex items-center gap-12">
                        {/* Weather */}
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Seoul</p>
                                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Weather</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-4xl">{weather ? getWeatherIcon(weather.code) : '☀️'}</span>
                                <div className="flex flex-col">
                                    <span className="text-2xl font-bold leading-none" style={{ color: '#1e293b' }}>{weather?.temp ?? '--'}°</span>
                                    <span className="text-xs font-medium" style={{ color: '#64748b' }}>{weather?.condition}</span>
                                </div>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-10" style={{ backgroundColor: '#e2e8f0' }}></div>

                        {/* Rates */}
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Exchange</p>
                                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Rates</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold px-1.5 rounded" style={{ color: '#64748b', backgroundColor: '#f1f5f9' }}>USD</span>
                                    <span className="text-lg font-bold leading-none" style={{ color: '#1e293b' }}>{rates?.usdVnd?.toLocaleString() ?? '---'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold px-1.5 rounded" style={{ color: '#64748b', backgroundColor: '#f1f5f9' }}>KRW</span>
                                    <span className="text-lg font-bold leading-none" style={{ color: '#1e293b' }}>{rates?.krwVnd?.toLocaleString() ?? '---'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {mode !== 'print' && (
                <div className="mt-4 flex flex-col items-center gap-4">
                    <div className="flex gap-4">
                        <button onClick={handleNativePrint} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-bold shadow-md">
                            🖨️ 인쇄 / PDF 저장
                        </button>
                        <button onClick={handleDownloadPDF} disabled={isGenerating} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm">
                            PDF 다운로드
                        </button>
                        <button onClick={handleDownloadImage} disabled={isGenerating} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm">
                            이미지 다운로드
                        </button>
                    </div>
                    
                    <div className="flex gap-4">
                        <button 
                            onClick={handlePublishToWordPress} 
                            disabled={isGenerating}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                                        <p className="text-center text-gray-800 font-bold mb-1 text-lg">
                                            📮 붙여넣을 곳을 골라 복사하세요
                                        </p>
                                        <p className="text-center text-gray-500 text-sm mb-4">
                                            어디서 들어온 방문인지 자동으로 표시됩니다 → 주간 리포트에 채널별로 잡힘
                                        </p>

                                        {/* 목적지별 복사 — 같은 URL 이라도 붙여넣는 곳에 따라 이름표가 달라야
                                            카톡/페북/Zalo 기여도를 가를 수 있다. 하나로 뭉치면 '직접 방문'에 묻힌다. */}
                                        <div className="flex flex-col gap-3">
                                            {Object.values(SHARE_TARGETS).map((t) => {
                                                const shareUrl = withShareUtm(
                                                    `https://chaovietnam.co.kr/daily-news-terminal/?v=${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`,
                                                    t.key
                                                );
                                                return (
                                                    <div
                                                        key={t.key}
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(shareUrl);
                                                            const btn = document.getElementById(`copy-msg-${t.key}`);
                                                            if (btn) {
                                                                btn.textContent = '✅ 복사됨!';
                                                                setTimeout(() => { btn.textContent = `📋 ${t.label} 복사`; }, 2000);
                                                            }
                                                        }}
                                                        className="flex items-center gap-3 p-4 bg-white rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border-2 border-blue-400"
                                                    >
                                                        <span className="text-2xl flex-none">{t.emoji}</span>
                                                        <span className="text-blue-700 font-mono text-xs flex-1 break-all font-bold">
                                                            {shareUrl}
                                                        </span>
                                                        <span id={`copy-msg-${t.key}`} className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg font-bold whitespace-nowrap">
                                                            📋 {t.label} 복사
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <p className="text-xs text-gray-500 mt-3 text-center">붙여넣는 곳에 맞는 버튼을 눌러야 유입 통계가 정확해집니다</p>
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
                    
                    {publishResult && !publishResult.success && (
                        <div className="p-4 rounded-lg bg-red-100 text-red-800">
                            <span>❌ 오류: {publishResult.error}</span>
                            <button onClick={() => setPublishResult(null)} className="ml-4 underline">닫기</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function getWeatherIcon(code) {
    if (code === 0) return '☀️';
    if (code > 0 && code < 3) return '⛅';
    if (code >= 3 && code < 50) return '☁️';
    if (code >= 50 && code < 80) return '🌧️';
    if (code >= 80) return '❄️';
    return '☀️';
}
