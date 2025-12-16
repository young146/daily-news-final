"use client";

import { useState } from "react";

export default function CardNewsSimple({ data, mode = "preview" }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [selectedTopNews, setSelectedTopNews] = useState(null); // 선택된 탑뉴스

  const { topNews, secondTopNews, topNewsList, weather, rates } = data || {};

  // 초기 선택: 첫 번째 탑뉴스
  const currentTopNews = selectedTopNews || topNews;

  // 디버깅: 현재 상태 확인
  console.log("[CardNews] Component render:", {
    hasTopNews: !!topNews,
    hasSelectedTopNews: !!selectedTopNews,
    currentTopNews: currentTopNews?.id,
    topNewsListLength: topNewsList?.length,
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

    if (!currentTopNews) {
      alert("탑뉴스가 없습니다. 관리자 페이지에서 탑뉴스를 선택해주세요.");
      return;
    }

    if (isGenerating) {
      console.log("[CardNews] Already generating, ignoring click");
      return;
    }

    // 바로 게시 진행 (confirm 없이)
    console.log("[CardNews] Confirm skipped, proceeding to publish");

    console.log("[CardNews] Publishing with topNewsId:", currentTopNews.id);
    setIsGenerating(true);
    setPublishResult(null);

    try {
      // 선택된 탑뉴스 정보를 서버에 전달
      const response = await fetch("/api/publish-card-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topNewsId: currentTopNews.id, // 선택된 탑뉴스 ID 전달
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

  return (
    <div className="flex flex-col items-center py-8 px-4 min-h-screen">
      {/* 탑뉴스 선택 UI */}
      {topNewsList && topNewsList.length > 0 && (
        <div className="mb-6 w-full max-w-4xl bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-bold mb-4 text-gray-800">
            📰 카드뉴스에 사용할 탑뉴스 선택
          </h3>
          <div
            className={`grid grid-cols-1 ${
              topNewsList.length > 1 ? "md:grid-cols-2" : ""
            } gap-4`}
          >
            {topNewsList.map((news, index) => {
              const isSelected =
                selectedTopNews?.id === news.id ||
                (!selectedTopNews && index === 0);
              return (
                <button
                  key={news.id}
                  onClick={() => setSelectedTopNews(news)}
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
                      <div className="text-sm font-semibold text-gray-600 mb-1">
                        탑뉴스 {index + 1}
                      </div>
                      <div
                        className={`text-base font-bold line-clamp-2 ${
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
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-sm text-gray-600">
            💡 선택한 탑뉴스로 카드뉴스가 재생성됩니다.
          </div>
        </div>
      )}

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
            ⚠️ 탑뉴스가 없습니다. 먼저 관리자 페이지에서 탑뉴스를 선택해주세요.
          </div>
        )}
        <button
          onClick={handlePublishToWordPress}
          disabled={isGenerating}
          className={`px-8 py-3 text-white rounded-lg text-base font-bold shadow-lg flex items-center gap-2 transition-all ${
            isGenerating
              ? "bg-gray-400 cursor-not-allowed opacity-50"
              : currentTopNews
              ? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
              : "bg-gray-400 cursor-not-allowed opacity-50"
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
