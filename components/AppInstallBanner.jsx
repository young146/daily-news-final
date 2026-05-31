"use client";

import { useState, useEffect } from "react";

const FEATURES = [
  {
    emoji: "🛒",
    title: "교민 중고거래 (당근 역할)",
    pain: "베트남엔 당근이 없어서 이사 올 때, 귀국할 때 물건 처리가 막막했던",
    gain: "교민끼리 직거래합니다. 누군지 아는 사람과 거래하니 안전하고 빠릅니다. 베트남의 당근입니다.",
    highlight: true,
  },
  {
    emoji: "💼",
    title: "구인구직",
    pain: "카톡방 여러 개 뒤지다 공고 놓쳤던",
    gain: "베트남 한인 기업 채용공고와 구직 정보가 한곳에 모여있습니다.",
  },
  {
    emoji: "🏠",
    title: "부동산",
    pain: "모르는 사람 믿었다가 한 번 당했던",
    gain: "교민 네트워크 기반 매물 정보. 아는 사람끼리 거래합니다.",
  },
  {
    emoji: "📖",
    title: "씬짜오베트남 잡지",
    pain: "아는 사람한테 빌려봐야 했던",
    gain: "격주마다 발행되는 전통 교민잡지 전체를 앱에서 바로 읽습니다.",
  },
  {
    emoji: "📰",
    title: "매일 베트남 뉴스",
    pain: "비자 정책 바뀐 것도 한참 뒤에야 알았던",
    gain: "사회·경제·문화·정책 주요 뉴스를 매일 아침 놓치지 않습니다.",
  },
  {
    emoji: "🤝",
    title: "진출업체 정보",
    pain: "거래할 한국 기업 찾는 게 번거로웠던",
    gain: "베트남 진출 한국 기업 소식과 거래처를 앱에서 바로 찾습니다.",
  },
];

const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.yourname.chaovnapp";
const IOS_URL = "https://apps.apple.com/us/app/id6754750793";

export default function AppInstallBanner() {
  const [ua, setUa] = useState("");

  useEffect(() => {
    setUa(navigator.userAgent || "");
  }, []);

  const goAndroid = () => {
    if (/Android/i.test(ua)) {
      window.location.href = `intent://open#Intent;scheme=chaovietnam;package=com.yourname.chaovnapp;S.browser_fallback_url=${encodeURIComponent(ANDROID_URL)};end`;
    } else {
      window.open(ANDROID_URL, "_blank");
    }
  };

  const goIOS = () => {
    if (/iPhone|iPad|iPod/i.test(ua)) {
      window.location.href = "chaovietnam://";
      setTimeout(() => { window.location.href = IOS_URL; }, 1500);
    } else {
      window.open(IOS_URL, "_blank");
    }
  };

  return (
    <section className="my-12 rounded-2xl overflow-hidden shadow-2xl">
      {/* 상단 헤더 */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-10 md:px-12 md:py-14 text-white text-center">
        <span className="inline-block bg-red-500 text-white text-xs font-black px-4 py-1.5 rounded-full mb-5 tracking-widest uppercase">
          교민 필수 앱
        </span>
        <h2 className="text-3xl md:text-5xl font-black mb-4 leading-tight">
          베트남엔 당근이 없습니다.<br />
          <span className="text-yellow-400">씬짜오 앱이 당근입니다.</span>
        </h2>
        <p className="text-slate-300 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          중고거래부터 구인구직, 부동산, 교민잡지, 매일 뉴스까지.<br />
          교민 생활에 필요한 모든 것이 앱 하나에 있습니다.
        </p>
      </div>

      {/* 6가지 이유 */}
      <div className="bg-slate-800 px-6 py-8 md:px-12">
        <p className="text-slate-400 text-sm font-bold uppercase tracking-widest text-center mb-6">
          설치 안 하면 손해인 6가지 이유
        </p>
        {/* 중고거래 — 최상단 강조 카드 */}
        {(() => {
          const hero = FEATURES[0];
          return (
            <div className="bg-gradient-to-r from-orange-500/20 to-yellow-500/10 border-2 border-orange-400/60 rounded-xl p-6 mb-4 flex flex-col md:flex-row md:items-center gap-4">
              <div className="text-5xl md:text-6xl shrink-0">{hero.emoji}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-black text-lg md:text-xl">{hero.title}</h3>
                  <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">가장 많이 씁니다</span>
                </div>
                <p className="text-slate-500 text-xs mb-2 line-through">{hero.pain}</p>
                <p className="text-orange-200 text-sm md:text-base leading-relaxed">{hero.gain}</p>
              </div>
            </div>
          );
        })()}
        {/* 나머지 5가지 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {FEATURES.slice(1).map((f) => (
            <div
              key={f.title}
              className="bg-slate-700/50 hover:bg-slate-700 transition-colors rounded-xl p-5 border border-slate-600/50"
            >
              <div className="text-3xl mb-3">{f.emoji}</div>
              <h3 className="text-white font-bold text-base mb-1">{f.title}</h3>
              <p className="text-slate-500 text-xs mb-2 line-through">{f.pain}</p>
              <p className="text-slate-300 text-sm leading-relaxed">{f.gain}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="bg-slate-900 px-6 py-8 md:px-12 text-center">
        <p className="text-slate-400 text-sm mb-6">
          지금 이 순간에도 교민들이 앱으로 중고 물건을 사고팔고,<br className="hidden sm:block"/>
          일자리를 찾고, 집을 구하고, 뉴스를 읽고 있습니다.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-sm mx-auto">
          {/* Android */}
          <button
            onClick={goAndroid}
            className="cursor-pointer flex-1 flex items-center justify-center gap-3 bg-[#3DDC84] hover:bg-[#2fba6e] text-white font-black py-4 px-6 rounded-xl transition-colors shadow-lg"
          >
            <svg className="w-6 h-6 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.523 15.3414c-.5235.228-.9954.3264-1.5156.3264-2.0431 0-3.8022-1.2618-4.6055-3.0788-.4399-1.0.0029-2.1607 1.0029-2.6006.9999-.4399 2.1607.0029 2.6006 1.0029.2827.642.7866 1.1459 1.4286 1.4286.6421.2828 1.3513.3082 2.0095.0711l2.6055-.9609c.5322-.1964.8394-.7658.7156-1.3184C19.2236 7.042 16.8437 5 14 5c-3.866 0-7 3.134-7 7s3.134 7 7 7c.9199 0 1.7959-.1774 2.6006-.4983.8047-.3208 1.333-1.1499 1.1001-2.0039l-.1777-.6564z"/>
            </svg>
            Google Play
          </button>
          {/* iOS */}
          <button
            onClick={goIOS}
            className="cursor-pointer flex-1 flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-black py-4 px-6 rounded-xl transition-colors shadow-lg"
          >
            <svg className="w-6 h-6 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            App Store
          </button>
        </div>
        <p className="text-slate-600 text-xs mt-4">무료 · Android / iOS</p>
      </div>
    </section>
  );
}
