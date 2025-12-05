'use client';

import { useState } from 'react';

export default function CardNewsSimple({ data, mode = 'preview' }) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [publishResult, setPublishResult] = useState(null);
    
    const now = new Date();
    const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = vietnamTime.getFullYear();
    const month = vietnamTime.getMonth() + 1;
    const day = vietnamTime.getDate();
    const hours = vietnamTime.getHours();
    const minutes = vietnamTime.getMinutes().toString().padStart(2, '0');
    const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const weekday = weekdays[vietnamTime.getDay()];
    const dateStr = `${year}년 ${month}월 ${day}일 ${weekday} ${hours}:${minutes}`;

    const handlePublishToWordPress = async () => {
        if (!confirm('카드 엽서를 WordPress에 게시하시겠습니까?')) return;
        
        setIsGenerating(true);
        setPublishResult(null);
        
        try {
            const response = await fetch('/api/publish-card-news', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
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
        <div className="flex flex-col items-center py-8 px-4 min-h-screen">
            
            {/* 테스트용 카드 미리보기 */}
            <div 
                style={{ 
                    width: '1200px', 
                    height: '630px', 
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    borderRadius: '12px',
                    position: 'relative'
                }}
            >
                <div style={{ 
                    position: 'absolute',
                    top: '40px',
                    left: '50px',
                    color: '#fb923c', 
                    fontSize: '72px', 
                    fontWeight: 'bold',
                    textDecoration: 'underline'
                }}>
                    {dateStr}
                </div>
                <h1 style={{ 
                    color: 'white', 
                    fontSize: '80px', 
                    fontWeight: 'bold',
                    margin: 0,
                    textAlign: 'center'
                }}>
                    씬짜오 오늘의 뉴스
                </h1>
                <p style={{ 
                    color: 'white', 
                    fontSize: '80px', 
                    marginTop: '30px',
                    textAlign: 'center',
                    fontWeight: 'bold'
                }}>
                    XinChao Today's News
                </p>
            </div>

            {/* 버튼 */}
            <div className="mt-6 flex flex-col items-center gap-4">
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
        </div>
    );
}
