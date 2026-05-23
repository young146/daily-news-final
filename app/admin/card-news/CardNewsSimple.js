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
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null);
  const [useGradient, setUseGradient] = useState(false);

  // 옵션 B 흐름:
  //   1. 이 화면에서 "이메일 카드 생성" 또는 "페이스북 카드 준비" 클릭 → 카드 발행 + cardImageUrl 저장
  //   2. 발행된 뉴스 관리 페이지에서 페북 미리보기 + 4페이지 게시 (별도 단계)
  //   기존 모달 (showPreviewModal) + 자동 게시 흐름은 제거됨.

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

  const handleEmailCardOnly = async () => {
    if (isGeneratingEmail || !currentTopNews) return;
    setIsGeneratingEmail(true);
    setPublishResult(null);
    try {
      const response = await fetch("/api/publish-card-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topNewsId: currentTopNews?.id || null, useGradient, emailOnly: true }),
      });
      const result = await response.json();
      if (result.success) {
        setPublishResult({ success: true, terminalUrl: result.terminalUrl, imageUrl: result.imageUrl, facebook: null });
      } else {
        throw new Error(result.error || "카드 생성 실패");
      }
    } catch (error) {
      alert(`이메일 카드 생성 실패: ${error.message}`);
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  // 페이스북 카드 준비 — WordPress 발행 + cardImageUrl 저장. 실제 페북 게시는 발행된 뉴스 페이지에서.
  const handleFbCardPrep = async (e) => {
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
          useGradient: useGradient,
          fbCardOnly: true, // 페북 자동 게시 X — 카드만 발행 (cardImageUrl 저장)
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
          facebook: result.facebook,
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
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-2xl font-bold text-gray-900">
            📰 카드뉴스에 사용할 뉴스 선택
          </h3>
          {isUsingFallback && fallbackReason && (
            <div className="px-4 py-2 bg-yellow-100 border-2 border-yellow-400 rounded-lg text-yellow-900 text-base font-bold">
              ⚠️ {fallbackReason}
            </div>
          )}
        </div>

        {newsListToShow.length === 0 ? (
          <div className="p-5 bg-red-50 border-2 border-red-300 rounded-lg text-red-900 text-base font-bold">
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
                        <div className="flex items-center gap-2 mb-1.5">
                          {isTopNews && (
                            <span className="text-sm font-bold bg-yellow-100 text-yellow-900 px-2.5 py-1 rounded border-2 border-yellow-400">
                              탑뉴스
                            </span>
                          )}
                          <span className="text-sm font-bold text-gray-800">
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
                          className={`text-base font-bold line-clamp-2 leading-snug ${isSelected ? "text-blue-800" : "text-gray-900"
                            }`}
                        >
                          {news.translatedTitle || news.title}
                        </div>
                        {news.source && (
                          <div className="text-sm text-gray-700 mt-1.5 font-semibold">
                            출처: {news.source}
                          </div>
                        )}
                        {news.publishedAt && (
                          <div className="text-sm text-gray-600 mt-1 font-medium">
                            {new Date(news.publishedAt).toLocaleDateString('ko-KR')}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
              <div className="text-base text-blue-900 font-bold">
                💡 <strong>선택된 뉴스:</strong> {currentTopNews ? (currentTopNews.translatedTitle || currentTopNews.title) : "없음"}
              </div>
              <div className="text-sm text-blue-800 mt-1.5 leading-relaxed font-medium">
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
          <div className="mb-2 p-4 bg-yellow-100 border-2 border-yellow-400 rounded-lg text-yellow-900 text-base font-bold">
            ⚠️ 뉴스가 선택되지 않았습니다. 위에서 뉴스를 선택해주세요.
          </div>
        )}
        {currentTopNews && (
          <div className="mb-2 p-4 bg-green-50 border-2 border-green-300 rounded-lg text-green-900 text-base font-bold">
            ✅ <strong>선택된 뉴스:</strong> {currentTopNews.translatedTitle || currentTopNews.title}
          </div>
        )}
        {currentTopNews && !currentTopNews.wordpressImageUrl && (
          <div className="mb-2 p-4 bg-red-100 border-2 border-red-400 rounded-lg text-red-900 text-base font-bold leading-relaxed">
            ⚠️ <strong>주의:</strong> 선택한 뉴스는 아직 WordPress에 발행되지 않아 이미지가 DB에 없습니다.
            이미지가 있는 뉴스를 선택하거나 먼저 뉴스를 발행해주세요.
          </div>
        )}

        {/* 그라디언트 사용 옵션 */}
        <div className="mb-2 p-4 bg-gray-50 border-2 border-gray-300 rounded-lg">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={useGradient}
              onChange={(e) => setUseGradient(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-2 border-gray-400 rounded focus:ring-blue-500"
            />
            <span className="text-base text-gray-800 font-semibold">
              그라디언트 배경 사용 (이미지가 없을 때만 적용)
            </span>
          </label>
        </div>

        {/* 이메일 카드 생성 (Facebook 없음, 빠름) */}
        <button
          onClick={handleEmailCardOnly}
          disabled={isGeneratingEmail || isGenerating || !currentTopNews}
          className={`px-10 py-4 text-white rounded-lg text-lg font-bold shadow-lg flex items-center gap-2 transition-all ${isGeneratingEmail || !currentTopNews
            ? "bg-gray-400 cursor-not-allowed opacity-60"
            : "bg-green-600 hover:bg-green-700 cursor-pointer"
            }`}
          type="button"
        >
          {isGeneratingEmail ? (
            <><span className="animate-spin">⏳</span> 카드 생성 중...</>
          ) : (
            <>📧 이메일 카드 생성</>
          )}
        </button>

        {/* Facebook 카드 준비 — 카드만 발행, 게시는 발행된 뉴스 페이지에서 별도 */}
        <button
          onClick={handleFbCardPrep}
          disabled={isGenerating || isGeneratingEmail || !currentTopNews}
          className={`px-10 py-4 text-white rounded-lg text-lg font-bold shadow-lg flex items-center gap-2 transition-all ${isGenerating || !currentTopNews
            ? "bg-gray-400 cursor-not-allowed opacity-60"
            : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
            }`}
          type="button"
        >
          {isGenerating ? (
            <><span className="animate-spin">⏳</span> 카드 준비 중...</>
          ) : (
            <>📘 페이스북 카드 준비</>
          )}
        </button>
        <p className="text-sm text-gray-700 -mt-2 font-semibold text-center">
          카드 준비 후 <strong className="text-blue-700">발행된 뉴스 관리</strong> 페이지에서 미리보기 확인 후 4페이지에 게시합니다.
        </p>

        {publishResult && publishResult.success && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg mx-4">
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <span className="text-5xl">🎉</span>
                  <p className="text-3xl font-bold text-green-700 mt-3">
                    게시 완료!
                  </p>
                  <p className="text-base text-gray-700 mt-2 font-semibold">
                    뉴스 터미널 대표이미지가 업데이트되었습니다
                  </p>
                </div>

                {/* ─── 카드 게시 완료 팝업 ─── */}
                <div className="bg-blue-50 p-5 rounded-xl border-2 border-blue-300">
                  {/* 뉴스 URL 표시 */}
                  <p className="text-sm font-bold text-blue-700 uppercase mb-2.5">📰 오늘 뉴스 터미널 URL</p>
                  <div className="flex items-center gap-2 p-3 bg-white rounded-lg border-2 border-blue-200 mb-3">
                    <span className="text-blue-800 font-mono text-sm font-semibold flex-1 break-all">
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
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold text-base transition-colors shadow-sm"
                  >
                    📋 뉴스 URL 복사
                  </button>
                </div>

                {/* Facebook 게시 안내 — 카드 준비 완료, 실제 게시는 발행된 뉴스 페이지에서 */}
                <div className="bg-[#e7f0fd] p-5 rounded-xl border-2 border-[#1877f2]">
                  <p className="text-sm font-bold text-[#1877f2] uppercase mb-2.5">📘 페이스북 카드 준비 완료</p>
                  <p className="text-base text-gray-800 mb-3 leading-relaxed font-medium">
                    페북 4페이지 게시를 위해 카드 이미지가 준비되었습니다.<br />
                    <span className="text-[#1877f2] font-bold">발행된 뉴스 페이지</span>에서 페북 그리드 미리보기 확인 후 4페이지에 게시하세요.
                  </p>
                  <a
                    href="/admin/published-news"
                    className="block w-full text-center bg-[#1877f2] hover:bg-[#166fe5] text-white py-3 rounded-lg font-bold text-base transition-colors shadow-sm"
                  >
                    📘 발행 뉴스 페이지 → 페북 미리보기 + 게시
                  </a>
                </div>

                {/* 이메일 발송 안내 */}
                <div className="bg-orange-50 p-5 rounded-xl border-2 border-orange-300">
                  <p className="text-sm font-bold text-orange-700 uppercase mb-2.5">💌 이메일 뉴스레터</p>
                  <p className="text-base text-gray-800 mb-3 leading-relaxed font-medium">
                    뉴스카드 + 홍보카드를 함께 보냅니다.<br />
                    <span className="text-orange-700 font-bold">발행 뉴스 페이지</span>에서 미리보기 후 발송하세요.
                  </p>
                  <a
                    href="/admin/published-news"
                    className="block w-full text-center bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-bold text-base transition-colors shadow-sm"
                  >
                    💌 발행 뉴스 페이지 → 이메일 발송
                  </a>
                </div>

                <div className="flex gap-3">
                  <a
                    href={`/admin/card-news/preview?imageUrl=${encodeURIComponent(publishResult.imageUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-gray-200 text-gray-900 py-3.5 rounded-lg font-bold text-base hover:bg-gray-300 transition-colors border-2 border-gray-300"
                  >
                    🖼️ 카드 보기
                  </a>

                  <button
                    onClick={() => {
                      setPublishResult(null);
                    }}
                    className="flex-1 bg-orange-600 text-white py-3.5 rounded-lg font-bold text-base hover:bg-orange-700 transition-colors shadow-sm"
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
                    className="flex-1 bg-green-600 text-white py-3.5 rounded-lg font-bold text-base hover:bg-green-700 transition-colors shadow-sm"
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
