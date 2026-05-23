// app/api/fb-publish/route.js
// 페북 카드 게시 — 준비된 NewsItem.cardImageUrl 로 4페이지 동시 게시.
//
// 흐름:
//   1. published-news 페이지에서 "📘 4페이지 게시" 버튼 클릭
//   2. POST /api/fb-publish { newsItemId }
//   3. NewsItem.cardImageUrl + facebook 채널 활성 홍보카드 조회
//   4. publishToFacebookPage Cloud Function 호출 (실제 페북 게시)
//   5. 결과 받아 isSentSNS=true + facebookPermalink 저장
//   6. pageResults 와 permalink 응답
//
// 사전 조건: publish-card-news 가 먼저 호출되어 cardImageUrl 이 저장된 상태여야 함.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300; // Cloud Function timeout(300s) 와 동일

export async function POST(request) {
  try {
    const body = await request.json();
    const { newsItemId } = body || {};

    if (!newsItemId) {
      return NextResponse.json({ success: false, error: "newsItemId 가 필요합니다" }, { status: 400 });
    }

    // 1. NewsItem 조회 + 사전 조건 검증
    const news = await prisma.newsItem.findUnique({ where: { id: newsItemId } });
    if (!news) {
      return NextResponse.json({ success: false, error: "뉴스를 찾을 수 없습니다" }, { status: 404 });
    }
    if (!news.cardImageUrl) {
      return NextResponse.json({
        success: false,
        error: "cardImageUrl 없음 — '전령카드 확인하기' 에서 페이스북 카드 준비를 먼저 실행하세요",
      }, { status: 400 });
    }
    if (news.isSentSNS) {
      return NextResponse.json({
        success: false,
        error: "이미 페이스북에 게시된 뉴스입니다",
        alreadyPosted: true,
        permalink: news.facebookPermalink || null,
      }, { status: 409 });
    }

    // 2. 페북 채널 활성 홍보카드 조회 (요일 + channel=facebook 필터 적용됨)
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://daily-news-final.vercel.app";
    if (baseUrl && !baseUrl.startsWith("http")) baseUrl = "https://" + baseUrl;

    const [selfR, adR] = await Promise.all([
      fetch(`${baseUrl}/api/promo-cards/active?kind=self&channel=facebook`),
      fetch(`${baseUrl}/api/promo-cards/active?kind=ad&channel=facebook`),
    ]);
    const selfCards = (await selfR.json()).cards || [];
    const adCards = (await adR.json()).cards || [];

    // 페북용 이미지(imageUrlFacebook) 우선, 없으면 기본 imageUrl 폴백
    const promos = [...selfCards, ...adCards]
      .filter(c => c.imageUrlFacebook || c.imageUrl)
      .map(c => ({
        imageUrl: c.imageUrlFacebook || c.imageUrl,
        title: c.title,
        linkUrl: c.linkUrl || "",
      }));

    // 3. 캡션 구성 — 베트남 시간대 기준 날짜
    const now = new Date();
    const vnDateStr = now.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric", month: "long", day: "numeric", weekday: "long",
    });
    const title = news.translatedTitle || news.title || "오늘의 뉴스";

    const fbBody = {
      news: {
        imageUrl: news.cardImageUrl,
        caption: `🗞 씬짜오 데일리뉴스 — ${vnDateStr}\n${title}\n오늘의 뉴스 전체 보기 ↓`,
        link: "https://chaovietnam.co.kr/daily-news-terminal/",
      },
      promos,
    };

    // 4. Cloud Function 호출
    if (!process.env.PUBLISH_API_KEY) {
      return NextResponse.json({
        success: false,
        error: "PUBLISH_API_KEY 환경변수가 설정되지 않았습니다",
      }, { status: 500 });
    }

    const fbRes = await fetch(
      "https://asia-northeast3-chaovietnam-login.cloudfunctions.net/publishToFacebookPage",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.PUBLISH_API_KEY,
        },
        body: JSON.stringify(fbBody),
        signal: AbortSignal.timeout(290000), // 5초 마진 두고 timeout
      }
    );
    const fbData = await fbRes.json();

    // 5. 결과 처리 — fbData.ok = 최소 1페이지 게시 성공
    if (fbData.ok && fbData.permalink) {
      await prisma.newsItem.update({
        where: { id: newsItemId },
        data: {
          isSentSNS: true,
          facebookPermalink: fbData.permalink,
        },
      });

      // 페이지별 결과 요약 (부분 성공 케이스 가시화)
      const pageResults = Array.isArray(fbData.pageResults) ? fbData.pageResults : [];
      const successCount = pageResults.filter(r => r.ok).length;
      const failureCount = pageResults.filter(r => !r.ok).length;

      return NextResponse.json({
        success: true,
        permalink: fbData.permalink,
        pageResults,
        summary: { total: pageResults.length, success: successCount, failure: failureCount },
      });
    } else {
      console.warn("[FB Publish] Cloud Function 실패:", fbData.error);
      return NextResponse.json({
        success: false,
        error: typeof fbData.error === "string" ? fbData.error : JSON.stringify(fbData.error || "페북 게시 실패"),
        pageResults: fbData.pageResults || [],
      }, { status: 502 });
    }
  } catch (error) {
    console.error("[FB Publish] Error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
    }, { status: 500 });
  }
}
