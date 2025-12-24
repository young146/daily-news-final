import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from 'fs';
import path from 'path';

export async function generateCardImageBuffer({
  title = "오늘의 뉴스",
  imageUrl = "",
  weatherTemp = "--",
  usdRate = "--",
  krwRate = "--",
  useGradient = false,
}) {
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

  // 이미지 경로 결정
  let finalImageSrc = "";
  if (imageUrl) {
    if (imageUrl.startsWith('/images/news/')) {
      try {
        const filePath = path.join(process.cwd(), 'public', imageUrl);
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
          const ext = path.extname(filePath).replace('.', '') || 'png';
          finalImageSrc = `data:image/${ext};base64,${fileBuffer.toString('base64')}`;
          console.log("[CardImage] ✅ Local image injected as base64");
        }
      } catch (err) {
        console.warn("[CardImage] ⚠️ Failed to read local image from FS:", err.message);
      }
      
      if (!finalImageSrc) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                       (process.env.NODE_ENV === "production" 
                         ? `https://${process.env.VERCEL_URL || 'localhost:3000'}`
                         : 'http://localhost:3000');
        finalImageSrc = `${baseUrl}${imageUrl}`;
      }
    } else if (imageUrl.startsWith('data:')) {
      finalImageSrc = imageUrl;
    } else {
      finalImageSrc = imageUrl;
    }
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
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
    .image-area img { width: 600px; height: 630px; object-fit: cover; }
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
    .logo { color: #1e3a5f; font-size: 28px; font-weight: bold; }
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
    .news-label { color: #fbbf24; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
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

  let browser = null;
  try {
    const isProduction = process.env.NODE_ENV === "production";
    
    // Vercel 환경인지 확인
    const isVercel = !!process.env.VERCEL;

    if (isProduction || isVercel) {
      console.log("[CardImage] Launching Puppeteer on Vercel/Production...");
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    } else {
      console.log("[CardImage] Launching Puppeteer on Local...");
      // 로컬 환경용 (Windows 등)
      // 윈도우 환경에서는 puppeteer-core 대신 일반 puppeteer를 쓰거나 크롬 경로를 지정해야 함
      // 여기서는 최대한 유연하게 처리
      try {
        const localPuppeteer = require("puppeteer");
        browser = await localPuppeteer.launch({
          headless: "new",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      } catch (e) {
        console.warn("[CardImage] Failed to launch local puppeteer, trying puppeteer-core with default path...");
        browser = await puppeteer.launch({
          headless: "new",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
          // 크롬이 설치된 일반적인 경로 (Windows 기준)
          executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        });
      }
    }
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);

    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });

    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));

    const pngBuffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1200, height: 630 },
    });

    return pngBuffer;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
