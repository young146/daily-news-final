"use client";

import { useState } from "react";

export default function CardNewsSimple({ data, mode = "preview" }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null); // 선택된 뉴스 (탑뉴스 또는 최신 뉴스)

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
  const newsImage = currentTopNews?.imageUrl || "";
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
      // alert는 제거하고 서버의 fallback 로직에 맡김
    }

    if (isGenerating) {
      console.log("[CardNews] Already generating, ignoring click");
      return;
    }

    // 바로 게시 진행 (confirm 없이)
    console.log("[CardNews] Confirm skipped, proceeding to publish");

    console.log("[CardNews] Publishing with selectedNewsId:", currentTopNews?.id || null);
    setIsGenerating(true);
    setPublishResult(null);

    try {
      // 선택된 뉴스 정보를 서버에 전달
      const response = await fetch("/api/publish-card-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topNewsId: currentTopNews?.id || null, // 선택된 뉴스 ID 전달
        }),
      });

      console.log("[CardNews] Response status:", response.status);

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

  // 뉴스 리스트가 없으면 빈 배열 사용
  const newsListToShow = allNewsList.length > 0 ? allNewsList : (topNewsList.length > 0 ? topNewsList : []);

  return (
    <div className="flex flex-col items-center py-8 px-4 min-h-screen">
      {/* 뉴스 선택 UI - 항상 표시 */}
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
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 shadow-md"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          isSelected
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
                        {news.imageUrl && (
                          <img
                            src={news.imageUrl}
                            alt=""
                            className="w-full h-32 object-cover rounded mb-2"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                        <div
                          className={`text-sm font-bold line-clamp-2 ${
                            isSelected ? "text-blue-700" : "text-gray-800"
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

      {/* 카드 뉴스 미리보기 */}
      <div
        style={{
          width: "1200px",
          height: "630px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          borderRadius: "12px",
        }}
      >
        {/* 배경 이미지 */}
        {newsImage ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: `url(${newsImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "brightness(0.4)",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
            }}
          />
        )}

        {/* 콘텐츠 오버레이 */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            padding: "40px 60px",
          }}
        >
          {/* 상단: 로고 + 날짜 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                color: "#ffffff",
                fontSize: "32px",
                fontWeight: "bold",
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              Xin Chào Vietnam
            </div>
            <div
              style={{
                backgroundColor: "rgba(139, 0, 0, 0.9)",
                color: "#ffffff",
                fontSize: "24px",
                fontWeight: "bold",
                padding: "10px 30px",
                borderRadius: "30px",
                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
              }}
            >
              {dateStr}
            </div>
          </div>

          {/* 중앙: 오늘의 뉴스 + 제목 */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                color: "#fbbf24",
                fontSize: "28px",
                fontWeight: "bold",
                marginBottom: "20px",
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              오늘의 뉴스
            </div>
            <h1
              style={{
                color: "#ffffff",
                fontSize: newsTitle.length > 40 ? "42px" : "52px",
                fontWeight: "bold",
                margin: 0,
                lineHeight: 1.3,
                maxWidth: "1000px",
                textShadow: "0 4px 8px rgba(0,0,0,0.7)",
              }}
            >
              {newsTitle}
            </h1>
          </div>

          {/* 하단: 날씨 + 환율 */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "40px",
              paddingTop: "20px",
              borderTop: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            <div
              style={{
                color: "#ffffff",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              <span>🌡️</span>
              <span>서울 {weatherTemp}°C</span>
            </div>
            <div
              style={{
                color: "#ffffff",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              <span>💵</span>
              <span>USD {usdRate}₫</span>
            </div>
            <div
              style={{
                color: "#ffffff",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              <span>💴</span>
              <span>KRW {krwRate}₫</span>
            </div>
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div className="mt-6 flex flex-col items-center gap-4">
        {!currentTopNews && (
          <div className="mb-4 p-4 bg-yellow-100 border border-yellow-400 rounded-lg text-yellow-800">
            ⚠️ 뉴스가 선택되지 않았습니다. 위에서 뉴스를 선택해주세요.
          </div>
        )}
        {currentTopNews && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            ✅ <strong>선택된 뉴스:</strong> {currentTopNews.translatedTitle || currentTopNews.title}
            {isUsingFallback && (
              <span className="block mt-1 text-xs text-yellow-700">
                (탑뉴스가 없어 최신 뉴스를 사용 중)
              </span>
            )}
          </div>
        )}
        <button
          onClick={handlePublishToWordPress}
          disabled={isGenerating || !currentTopNews}
          className={`px-8 py-3 text-white rounded-lg text-base font-bold shadow-lg flex items-center gap-2 transition-all ${
            isGenerating || !currentTopNews
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

                <div className="bg-blue-50 p-5 rounded-xl border-2 border-blue-300">
                  <p className="text-center text-gray-800 font-bold mb-4 text-lg">
                    📮 SNS 공유용 URL
                  </p>

                  <div
                    onClick={() => {
                      const dateParam = `${String(
                        new Date().getMonth() + 1
                      ).padStart(2, "0")}${String(
                        new Date().getDate()
                      ).padStart(2, "0")}`;
                      const shareUrl = `https://chaovietnam.co.kr/daily-news-terminal/?v=${dateParam}`;
                      const textArea = document.createElement("textarea");
                      textArea.value = shareUrl;
                      textArea.style.position = "fixed";
                      textArea.style.left = "-9999px";
                      document.body.appendChild(textArea);
                      textArea.select();
                      document.execCommand("copy");
                      document.body.removeChild(textArea);
                      const btn = document.getElementById("copy-success-msg");
                      if (btn) {
                        btn.textContent = "✅ 복사됨!";
                        setTimeout(() => {
                          btn.textContent = "📋 클릭하여 복사";
                        }, 2000);
                      }
                    }}
                    className="flex items-center gap-3 p-4 bg-white rounded-lg cursor-pointer hover:bg-gray-50 transition-colors border-2 border-blue-400"
                  >
                    <span className="text-blue-700 font-mono text-sm flex-1 break-all font-bold">
                      https://chaovietnam.co.kr/daily-news-terminal/?v=
                      {`${String(new Date().getMonth() + 1).padStart(
                        2,
                        "0"
                      )}${String(new Date().getDate()).padStart(2, "0")}`}
                    </span>
                    <span
                      id="copy-success-msg"
                      className="text-sm bg-blue-600 text-white px-3 py-2 rounded-lg font-bold whitespace-nowrap"
                    >
                      📋 클릭하여 복사
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <a
                    href={publishResult.terminalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-gray-100 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                  >
                    🔗 미리보기
                  </a>
                  <button
                    onClick={() => {
                      // 확인 버튼 클릭 시 모든 isCardNews 초기화
                      fetch('/api/reset-card-news', { method: 'POST' })
                        .then(() => {
                          setPublishResult(null);
                          window.location.reload(); // 페이지 새로고침하여 업데이트된 데이터 표시
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
