"use client";

import { useState, useEffect } from "react";

// URL을 클릭 가능한 링크로 변환
const linkify = (text) => {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      : part
  );
};

export default function CardNewsSimple({ data, mode = "preview" }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null); // 선택된 뉴스 (탑뉴스 또는 최신 뉴스)
  const [useGradient, setUseGradient] = useState(false); // 그라디언트 사용 여부 (기본값: false)
  const [promoCards, setPromoCards] = useState([]); // 활성 홍보카드

  // 활성 홍보카드 로드
  useEffect(() => {
    fetch('/api/promo-cards/active')
      .then(r => r.json())
      .then(d => { if (d.success) setPromoCards(d.cards || []); })
      .catch(e => console.warn('[PromoCards] 로드 실패:', e));
  }, []);

  const {
    topNews,
    topNewsList = [],
    allNewsList = [], // 전체 뉴스 리스트 (탑뉴스 + 최신 뉴스)
    isUsingFallback = false,
    fallbackReason = null,
    weather,
    rates
  } = data || {};

  // 초기 선택: 선택된 뉴스가 없으면 기본 뉴스 사용
  const currentTopNews = selectedNews || topNews;

  // 이미지 URL 결정
  const newsImage = currentTopNews?.wordpressImageUrl || "";

  // 디버깅: 현재 상태 확인
  console.log("[CardNews] Component render:", {
    hasTopNews: !!topNews,
    hasSelectedNews: !!selectedNews,
    currentTopNews: currentTopNews?.id,
    topNewsListLength: topNewsList?.length,
    allNewsListLength: allNewsList?.length,
  });

  const now = new Date();
  const vietnamTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  );
  const year = vietnamTime.getFullYear();
  const month = vietnamTime.getMonth() + 1;
  const day = vietnamTime.getDate();
  const weekdays = [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
  ];
  const weekday = weekdays[vietnamTime.getDay()];
  const dateStr = `${year}년 ${month}월 ${day}일 ${weekday}`;

  const newsTitle =
    currentTopNews?.translatedTitle || currentTopNews?.title || "오늘의 뉴스";
  const weatherTemp = weather?.temp ?? "--";
  const usdRate =
    typeof rates?.usdVnd === "number"
      ? rates.usdVnd.toLocaleString()
      : rates?.usdVnd ?? "--";
  const krwRate =
    typeof rates?.krwVnd === "number"
      ? rates.krwVnd.toFixed(1)
      : rates?.krwVnd ?? "--";

  const handlePublishToWordPress = async (e) => {
    // 이벤트가 전달된 경우 기본 동작 방지
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    console.log("[CardNews] handlePublishToWordPress called", {
      currentTopNews: currentTopNews?.id,
      isGenerating,
      hasTopNews: !!topNews,
    });

    // 탑뉴스가 없어도 서버로 요청을 보내서 fallback 로직이 작동하도록 함
    if (!currentTopNews) {
      console.warn("[CardNews] No top news selected, but proceeding to let server use fallback");
    }

    if (isGenerating) {
      console.log("[CardNews] Already generating, ignoring click");
      return;
    }

    console.log("[CardNews] Publishing with selectedNewsId:", currentTopNews?.id || null);
    setIsGenerating(true);
    setPublishResult(null);

    try {
      const response = await fetch("/api/publish-card-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topNewsId: currentTopNews?.id || null,
          useGradient: useGradient, // 그라디언트 사용 여부 전달
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }
        throw new Error(errorData.error || `서버 오류: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setPublishResult({
          success: true,
          terminalUrl: result.terminalUrl,
          imageUrl: result.imageUrl,
        });
      } else {
        throw new Error(result.error || "알 수 없는 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("[CardNews] Publish error:", error);
      const errorMessage = error.message || "알 수 없는 오류가 발생했습니다.";
      setPublishResult({ success: false, error: errorMessage });
      alert(`게시 실패: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const newsListToShow = allNewsList.length > 0 ? allNewsList : (topNewsList.length > 0 ? topNewsList : []);

  return (
    <div className="flex flex-col items-center py-8 px-4 min-h-screen">
      <div className="mb-6 w-full max-w-4xl bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            📰 카드뉴스에 사용할 뉴스 선택
          </h3>
          {isUsingFallback && fallbackReason && (
            <div className="px-3 py-1 bg-yellow-100 border border-yellow-400 rounded-lg text-yellow-800 text-sm">
              ⚠️ {fallbackReason}
            </div>
          )}
        </div>

        {newsListToShow.length === 0 ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            ⚠️ 사용 가능한 뉴스가 없습니다. 관리자 페이지에서 뉴스를 선택해주세요.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {newsListToShow.map((news, index) => {
                const isTopNews = topNewsList.some(tn => tn.id === news.id);
                const isSelected = selectedNews?.id === news.id || (!selectedNews && index === 0);

                return (
                  <button
                    key={news.id}
                    onClick={() => setSelectedNews(news)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${isSelected
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected
                          ? "border-blue-500 bg-blue-500"
                          : "border-gray-300"
                          }`}
                      >
                        {isSelected && (
                          <span className="text-white text-xs">✓</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isTopNews && (
                            <span className="text-xs font-bold bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                              탑뉴스
                            </span>
                          )}
                          <span className="text-xs font-semibold text-gray-600">
                            {isTopNews ? `탑뉴스 ${topNewsList.findIndex(tn => tn.id === news.id) + 1}` : `뉴스 ${index + 1}`}
                          </span>
                        </div>
                        {news.wordpressImageUrl ? (
                          <div className="relative">
                            <img
                              src={news.wordpressImageUrl}
                              alt=""
                              className="w-full h-32 object-cover rounded mb-2 border-2 border-green-200"
                            />
                            <span className="absolute top-1 right-1 bg-green-500 text-white text-[10px] px-1 rounded font-bold">
                              DB 이미지 OK
                            </span>
                          </div>
                        ) : news.imageUrl ? (
                          <div className="relative">
                            <img
                              src={news.imageUrl}
                              alt=""
                              className="w-full h-32 object-cover rounded mb-2 opacity-50 grayscale"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="bg-red-500 text-white text-[10px] px-2 py-1 rounded font-bold shadow-lg">
                                ⚠️ 미발행 (사용불가)
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-32 bg-gray-100 rounded mb-2 flex items-center justify-center text-gray-400 text-xs">
                            이미지 없음
                          </div>
                        )}
                        <div
                          className={`text-sm font-bold line-clamp-2 ${isSelected ? "text-blue-700" : "text-gray-800"
                            }`}
                        >
                          {news.translatedTitle || news.title}
                        </div>
                        {news.source && (
                          <div className="text-xs text-gray-500 mt-1">
                            출처: {news.source}
                          </div>
                        )}
                        {news.publishedAt && (
                          <div className="text-xs text-gray-400 mt-1">
                            {new Date(news.publishedAt).toLocaleDateString('ko-KR')}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm text-blue-800">
                💡 <strong>선택된 뉴스:</strong> {currentTopNews ? (currentTopNews.translatedTitle || currentTopNews.title) : "없음"}
              </div>
              <div className="text-xs text-blue-600 mt-1">
                선택한 뉴스의 이미지와 제목으로 카드뉴스가 생성됩니다. 다른 뉴스를 선택하면 카드뉴스가 재생성됩니다.
              </div>
            </div>
          </>
        )}
      </div>

      <div
        style={{
          width: "800px",
          height: "420px",
          display: "flex",
          flexDirection: "row",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          borderRadius: "12px",
          overflow: "hidden",
          backgroundColor: "#ffffff",
        }}
      >
        {/* 왼쪽: 이미지 영역 (50%) */}
        <div
          style={{
            width: "400px",
            height: "420px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000000",
          }}
        >
          {newsImage ? (
            <img
              src={newsImage}
              alt="News"
              style={{
                width: "400px",
                height: "420px",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "400px",
                height: "420px",
                background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
              }}
            />
          )}
        </div>

        {/* 오른쪽: 텍스트 영역 (50%) */}
        <div
          style={{
            width: "400px",
            height: "420px",
            display: "flex",
            flexDirection: "column",
            padding: "30px 40px",
            backgroundColor: "#ffffff",
          }}
        >
          {/* 헤더 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                color: "#1e3a5f",
                fontSize: "24px",
                fontWeight: "bold",
              }}
            >
              Xin Chào Vietnam
            </div>
            <div
              style={{
                backgroundColor: "#8b0000",
                color: "#ffffff",
                fontSize: "16px",
                fontWeight: "bold",
                padding: "6px 20px",
                borderRadius: "20px",
              }}
            >
              {dateStr}
            </div>
          </div>

          {/* 메인 콘텐츠 */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                color: "#fbbf24",
                fontSize: "20px",
                fontWeight: "bold",
                marginBottom: "15px",
              }}
            >
              오늘의 뉴스
            </div>
            <h1
              style={{
                color: "#1f2937",
                fontSize: newsTitle.length > 40 ? "28px" : "32px",
                fontWeight: "bold",
                margin: 0,
                lineHeight: 1.3,
                marginBottom: "20px",
              }}
            >
              {newsTitle}
            </h1>
          </div>

          {/* 하단 정보 */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              gap: "20px",
              paddingTop: "15px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                color: "#374151",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>🌡️</span>
              <span>서울 {weatherTemp}°C</span>
            </div>
            <div
              style={{
                color: "#374151",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>💵</span>
              <span>USD {usdRate}₫</span>
            </div>
            <div
              style={{
                color: "#374151",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>💴</span>
              <span>KRW {krwRate}₫</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-4">
        {!currentTopNews && (
          <div className="mb-4 p-4 bg-yellow-100 border border-yellow-400 rounded-lg text-yellow-800">
            ⚠️ 뉴스가 선택되지 않았습니다. 위에서 뉴스를 선택해주세요.
          </div>
        )}
        {currentTopNews && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            ✅ <strong>선택된 뉴스:</strong> {currentTopNews.translatedTitle || currentTopNews.title}
          </div>
        )}
        {currentTopNews && !currentTopNews.wordpressImageUrl && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 rounded-lg text-red-800">
            ⚠️ <strong>주의:</strong> 선택한 뉴스는 아직 WordPress에 발행되지 않아 이미지가 DB에 없습니다.
            이미지가 있는 뉴스를 선택하거나 먼저 뉴스를 발행해주세요.
          </div>
        )}

        {/* 그라디언트 사용 옵션 */}
        <div className="mb-4 p-4 bg-gray-50 border border-gray-300 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useGradient}
              onChange={(e) => setUseGradient(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              그라디언트 배경 사용 (이미지가 없을 때만 적용)
            </span>
          </label>
        </div>

        <button
          onClick={handlePublishToWordPress}
          disabled={isGenerating || !currentTopNews}
          className={`px-8 py-3 text-white rounded-lg text-base font-bold shadow-lg flex items-center gap-2 transition-all ${isGenerating || !currentTopNews
            ? "bg-gray-400 cursor-not-allowed opacity-50"
            : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
            }`}
          type="button"
        >
          {isGenerating ? (
            <>
              <span className="animate-spin">⏳</span>
              게시 중...
            </>
          ) : (
            <>📤 WordPress에 카드 엽서 게시</>
          )}
        </button>

        {publishResult && publishResult.success && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg mx-4">
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <span className="text-4xl">🎉</span>
                  <p className="text-2xl font-bold text-green-700 mt-3">
                    게시 완료!
                  </p>
                  <p className="text-gray-500 mt-1">
                    뉴스 터미널 대표이미지가 업데이트되었습니다
                  </p>
                </div>

                {/* ─── 카드 게시 완료 팝업 ─── */}
                <div className="bg-blue-50 p-4 rounded-xl border-2 border-blue-200">
                  {/* 뉴스 URL 표시 */}
                  <p className="text-xs font-semibold text-blue-500 uppercase mb-2">📰 오늘 뉴스 터미널 URL</p>
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-blue-200 mb-3">
                    <span className="text-blue-700 font-mono text-xs flex-1 break-all">
                      https://chaovietnam.co.kr/daily-news-terminal/?v={`${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`}
                    </span>
                  </div>

                  {/* 뉴스 URL 복사 */}
                  <button
                    type="button"
                    id="news-copy-btn"
                    onClick={() => {
                      const dateParam = `${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`;
                      const newsUrl = `https://chaovietnam.co.kr/daily-news-terminal/?v=${dateParam}`;
                      navigator.clipboard.writeText(newsUrl).then(() => {
                        const btn = document.getElementById('news-copy-btn');
                        if (btn) {
                          btn.textContent = '✅ 복사됨!';
                          setTimeout(() => { btn.textContent = '📋 뉴스 URL 복사'; }, 2000);
                        }
                      });
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold text-sm transition-colors"
                  >
                    📋 뉴스 URL 복사
                  </button>
                </div>

                {/* 이메일 발송 안내 */}
                <div className="bg-orange-50 p-4 rounded-xl border-2 border-orange-200">
                  <p className="text-xs font-semibold text-orange-500 uppercase mb-2">💌 이메일 뉴스레터</p>
                  <p className="text-sm text-gray-600 mb-3">
                    뉴스카드 + 홍보카드를 함께 보냅니다.<br />
                    <span className="text-orange-600 font-medium">발행 뉴스 페이지</span>에서 미리보기 후 발송하세요.
                  </p>
                  <a
                    href="/admin/published-news"
                    className="block w-full text-center bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg font-bold text-sm transition-colors"
                  >
                    💌 발행 뉴스 페이지 → 이메일 발송
                  </a>
                </div>


                <div className="flex gap-3">
                  <a
                    href={`/admin/card-news/preview?imageUrl=${encodeURIComponent(publishResult.imageUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                  >
                    🖼️ 카드 보기
                  </a>

                  <button
                    onClick={() => {
                      setPublishResult(null);
                    }}
                    className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 transition-colors"
                  >
                    🔄 다시 생성
                  </button>

                  <button
                    onClick={() => {
                      fetch('/api/reset-card-news', { method: 'POST' })
                        .then(() => {
                          setPublishResult(null);
                          window.location.reload();
                        })
                        .catch(err => {
                          console.error('Reset failed:', err);
                          setPublishResult(null);
                        });
                    }}
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
