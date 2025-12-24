import puppeteer from "puppeteer";
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET(request) {
  // Vercel Protection Bypass 헤더 확인 (내부 API 호출 검증)
  const bypassSecret = request.headers.get('x-vercel-protection-bypass');
  const expectedSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  
  // 프로덕션 환경에서만 검증 (개발 환경에서는 생략)
  if (process.env.NODE_ENV === "production" && expectedSecret) {
    if (!bypassSecret || bypassSecret !== expectedSecret) {
      console.warn("[CardImage] Missing or invalid bypass secret");
      return new Response(
        JSON.stringify({
          error: "Authentication Required",
          message: "This API requires authentication for internal calls"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  const { searchParams } = new URL(request.url);

  const title = searchParams.get("title") || "오늘의 뉴스";
  const imageUrl = searchParams.get("image") || "";
  const weatherTemp = searchParams.get("weather") || "--";
  const usdRate = searchParams.get("usd") || "--";
  const krwRate = searchParams.get("krw") || "--";
  const useGradient = searchParams.get("useGradient") === "true";

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

  const fontSize = title.length > 40 ? 42 : 52;

  console.log(
    "[CardImage] Generating with image:",
    imageUrl ? (imageUrl.startsWith('/') ? 'local file' : imageUrl.substring(0, 60) + "...") : "none"
  );
  console.log("[CardImage] Title:", title);
  console.log("[CardImage] Date string:", dateStr);

  // 이미지 경로 결정 (로컬 경로 우선)
  let finalImageSrc = "";
  if (imageUrl) {
    if (imageUrl.startsWith('/images/news/')) {
      // 로컬 파일 경로 - 절대 URL로 변환
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                     (process.env.NODE_ENV === "production" 
                       ? `https://${process.env.VERCEL_URL || 'localhost:3000'}`
                       : 'http://localhost:3000');
      finalImageSrc = `${baseUrl}${imageUrl}`;
      console.log("[CardImage] ✅ Using local image path:", finalImageSrc);
    } else if (imageUrl.startsWith('data:')) {
      // Base64 data URL
      finalImageSrc = imageUrl;
      console.log("[CardImage] ✅ Using base64 image");
    } else {
      // WordPress URL
      finalImageSrc = imageUrl;
      console.log("[CardImage] ⚠️ Using WordPress URL:", imageUrl.substring(0, 60) + "...");
    }
  }

  if (!finalImageSrc && !useGradient) {
    return new Response(
      JSON.stringify({
        error: "이미지 URL이 없습니다. WordPress에 발행된 뉴스를 선택해주세요.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let browser = null;
  try {
    // HTML 생성
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      width: 1200px;
      height: 630px;
      display: flex;
      flex-direction: row;
      font-family: 'Noto Sans KR', 'Malgun Gothic', 'AppleGothic', sans-serif;
      background-color: #ffffff;
      overflow: hidden;
    }
    .image-area {
      width: 600px;
      height: 630px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #000000;
      overflow: hidden;
    }
    .image-area img {
      width: 600px;
      height: 630px;
      object-fit: cover;
    }
    .gradient-bg {
      width: 600px;
      height: 630px;
      background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
    }
    .text-area {
      width: 600px;
      height: 630px;
      display: flex;
      flex-direction: column;
      padding: 40px 60px;
      background-color: #ffffff;
      color: #1f2937;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 30px;
    }
    .logo {
      color: #1e3a5f;
      font-size: 28px;
      font-weight: bold;
    }
    .date-badge {
      background-color: #8b0000;
      color: #ffffff;
      font-size: 20px;
      font-weight: bold;
      padding: 8px 24px;
      border-radius: 24px;
    }
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .news-label {
      color: #fbbf24;
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .title {
      color: #1f2937;
      font-size: ${fontSize}px;
      font-weight: bold;
      line-height: 1.3;
      margin-bottom: 30px;
    }
    .footer {
      display: flex;
      justify-content: flex-start;
      gap: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    .footer-item {
      color: #374151;
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="image-area">
    ${finalImageSrc ? `<img src="${finalImageSrc}" alt="" />` : useGradient ? '<div class="gradient-bg"></div>' : '<div style="width: 600px; height: 630px; background-color: #000000;"></div>'}
  </div>
  <div class="text-area">
    <div class="header">
      <div class="logo">Xin Chào Vietnam</div>
      <div class="date-badge">${dateStr}</div>
    </div>
    <div class="main-content">
      <div class="news-label">오늘의 뉴스</div>
      <h1 class="title">${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
    </div>
    <div class="footer">
      <div class="footer-item">🌡️ 서울 ${weatherTemp}°C</div>
      <div class="footer-item">💵 USD ${usdRate}₫</div>
      <div class="footer-item">💴 KRW ${krwRate}₫</div>
    </div>
  </div>
</body>
</html>
    `;

    // Puppeteer로 렌더링
    console.log("[CardImage] Launching Puppeteer...");
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);

    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

    // HTML 콘텐츠를 직접 로드
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0', // 네트워크 활동이 없을 때까지 대기
      timeout: 60000,
    });

    // 폰트 로드 대기 (선택 사항, @import url이 충분히 빠르지 않을 경우)
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await new Promise(resolve => setTimeout(resolve, 1000)); // 추가 대기

    const pngBuffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1200, height: 630 },
    });

    console.log("[CardImage] ✅ Image generated successfully via Puppeteer, size:", pngBuffer.length, "bytes");

    return new Response(pngBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("[CardImage] Generation error:", e);
    console.error("[CardImage] Error stack:", e.stack);
    return new Response(
      JSON.stringify({
        error: "이미지 생성 실패",
        details: e.message,
        stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
