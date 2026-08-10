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
import { sendNewsletterWithFallback } from "@/lib/email-service";

export const runtime = "nodejs";
export const maxDuration = 300; // Cloud Function timeout(300s) 와 동일

/**
 * 게시 결과를 남기고, 한 페이지라도 실패했으면 관리자에게 즉시 메일을 보낸다.
 *
 * 왜 필요한가 (2026-08-10):
 *   이 라우트는 **한 페이지만 성공해도** isSentSNS=true 로 기록한다(fbData.ok 의 정의).
 *   페이지별 결과는 Cloud Function 이 Firestore(broadcastLogs)에 남기지만
 *   **아무도 그걸 보지 않는다.** 그래서 "3개 페이지에 안 올라갔다"가 사실이어도
 *   시스템에서는 성공으로 보였다. 사람이 페북 4곳을 일일이 확인할 수는 없다.
 *
 *   → 실패가 있으면 그 자리에서 알린다. 성공이면 조용히 기록만 남긴다
 *     (매일 성공 메일이 오면 곧 아무도 안 읽게 된다).
 *
 * 이 함수는 **절대 throw 하지 않는다.** 알림이 실패해도 게시 결과 응답은 나가야 한다.
 */
async function recordFbResult({ title, pageResults, totalError }) {
  const results = Array.isArray(pageResults) ? pageResults : [];
  const okList = results.filter((r) => r.ok);
  const badList = results.filter((r) => !r.ok);
  const hasFailure = badList.length > 0 || !!totalError;

  const status = totalError ? "FAILED" : badList.length ? "PARTIAL" : "SUCCESS";
  const summary = results.length
    ? `${results.length}개 페이지 중 ${okList.length}개 성공${badList.length ? ` · 실패 ${badList.length}` : ""}`
    : (totalError ? "전체 실패" : "결과 없음");

  // 1) 관리자 화면(실행 로그)에 남긴다 — 나중에 "그날 어땠나"를 볼 수 있게.
  try {
    await prisma.crawlerLog.create({
      data: {
        status,
        itemsFound: okList.length,
        message: `[페북] ${summary}${title ? ` — ${String(title).slice(0, 50)}` : ""}`,
        errorDetails: JSON.stringify({ totalError: totalError || null, pageResults: results }),
      },
    });
  } catch (e) {
    console.warn("[FB Publish] 로그 기록 실패(무시):", e?.message);
  }

  if (!hasFailure) return;

  // 2) 실패가 있을 때만 메일.
  try {
    const recipients = (process.env.AD_ALERT_EMAIL || process.env.REPORT_EMAIL
      || "younghan146@gmail.com,info@chaovietnam.co.kr")
      .split(",").map((e) => e.trim()).filter(Boolean);

    const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const rows = results.map((r) => `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb">${r.ok ? "✅" : "❌"} ${esc(r.name || r.pageId)}</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
          ${r.ok ? `시도 ${r.attempts}회` : esc(r.error).slice(0, 160)}
        </td>
      </tr>`).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;color:#111827">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;padding:22px">
    <h1 style="margin:0 0 6px;font-size:18px">🔴 페이스북 게시 실패</h1>
    <div style="color:#6b7280;font-size:13px;margin-bottom:16px">${esc(summary)}</div>
    ${title ? `<div style="margin-bottom:14px;font-size:14px"><b>${esc(title)}</b></div>` : ""}
    ${totalError ? `<div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px">
        전체 실패: ${esc(totalError).slice(0, 300)}</div>` : ""}
    ${results.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>` : ""}
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.7">
      · 관리자 → <b>발행된 뉴스</b> 에서 「📘 4페이지 게시」를 다시 누르면 재시도됩니다.<br>
      · 이미 성공한 페이지에는 중복 게시될 수 있으니, 실패한 곳만 확인 후 진행하세요.<br>
      · 흔한 원인: 페이지 토큰 만료 / Firebase 결제 중단(외부 호출 차단) / 이미지 주소 접근 불가.
    </div>
  </div>
</body></html>`;

    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    await sendNewsletterWithFallback(recipients, `🔴 페이스북 게시 실패 — ${summary} (${today})`, html, {
      campaignId: `fb_fail_${today.replace(/-/g, "")}_${Date.now()}`,
      forceSmtp: true,
    });
  } catch (e) {
    console.warn("[FB Publish] 실패 알림 메일 전송 실패(무시):", e?.message);
  }
}

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

      // 기록 + (실패가 있으면) 관리자 알림. 응답을 막지 않도록 기다리되 절대 throw 안 함.
      await recordFbResult({ title, pageResults });

      return NextResponse.json({
        success: true,
        permalink: fbData.permalink,
        pageResults,
        summary: { total: pageResults.length, success: successCount, failure: failureCount },
      });
    } else {
      console.warn("[FB Publish] Cloud Function 실패:", fbData.error);
      const errText = typeof fbData.error === "string" ? fbData.error : JSON.stringify(fbData.error || "페북 게시 실패");
      // 전체 실패 — 여기가 가장 알림이 필요한 자리다(예: 2026-08-10 Firebase 결제 중단).
      await recordFbResult({ title, pageResults: fbData.pageResults, totalError: errText });
      return NextResponse.json({
        success: false,
        error: errText,
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
