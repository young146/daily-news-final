import { createCanvas, loadImage, registerFont } from "canvas";
import axios from 'axios';
import path from 'path';
import fs from 'fs';

// 폰트 등록 (Vercel 서버 환경에서 한국어 깨짐 방지)
try {
  const boldFontPath = path.join(process.cwd(), 'public', 'fonts', 'NanumGothic-Bold.ttf');
  const regularFontPath = path.join(process.cwd(), 'public', 'fonts', 'NanumGothic-Regular.ttf');
  
  if (fs.existsSync(boldFontPath)) {
    registerFont(boldFontPath, { family: 'NanumGothic', weight: 'bold' });
    console.log("[CardImage] ✅ Bold font registered");
  }
  if (fs.existsSync(regularFontPath)) {
    registerFont(regularFontPath, { family: 'NanumGothic', weight: 'normal' });
    console.log("[CardImage] ✅ Regular font registered");
  }
} catch (err) {
  console.warn("[CardImage] ⚠️ Font registration failed:", err.message);
}

export async function generateCardImageBuffer({
  title = "오늘의 뉴스",
  imageUrl = "",
  weatherTemp = "--",
  usdRate = "--",
  krwRate = "--",
}) {
  if (!imageUrl) throw new Error("이미지 URL이 없습니다.");

  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');

  // 1. 왼쪽 이미지 영역
  try {
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const image = await loadImage(Buffer.from(response.data));
    
    const iw = image.width, ih = image.height;
    const r = Math.max(600 / iw, 630 / ih);
    const nw = iw * r, nh = ih * r;
    ctx.drawImage(image, (600 - nw) / 2, (630 - nh) / 2, nw, nh);
  } catch (e) {
    throw new Error(`이미지 로드 실패: ${e.message}`);
  }

  // 2. 오른쪽 텍스트 영역
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(600, 0, 600, 630);

  ctx.textBaseline = 'top';
  
  // 날짜 배지
  const now = new Date();
  const vietnamTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const dateStr = `${vietnamTime.getFullYear()}.${String(vietnamTime.getMonth() + 1).padStart(2, '0')}.${String(vietnamTime.getDate()).padStart(2, '0')}`;
  
  ctx.fillStyle = '#8b0000';
  // Round rect
  const rx = 1000, ry = 40, rw = 160, rh = 40, rad = 20;
  ctx.beginPath();
  ctx.moveTo(rx + rad, ry);
  ctx.lineTo(rx + rw - rad, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
  ctx.lineTo(rx + rw, ry + rh - rad);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
  ctx.lineTo(rx + rad, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
  ctx.lineTo(rx, ry + rad);
  ctx.quadraticCurveTo(rx, ry, rx + rad, ry);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "NanumGothic", sans-serif';
  ctx.fillText(dateStr, 1030, 50);

  // 로고
  ctx.fillStyle = '#1e3a5f';
  ctx.font = 'bold 32px "NanumGothic", sans-serif';
  ctx.fillText('Xin Chào', 650, 40);
  ctx.fillText('Vietnam', 650, 80);

  // 라벨
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 24px "NanumGothic", sans-serif';
  ctx.fillText('오늘의 뉴스', 650, 180);

  // 제목
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 48px "NanumGothic", sans-serif'; 
  
  const maxWidth = 500;
  const chars = title.split('');
  let line = '';
  let y = 230;

  for (let n = 0; n < chars.length; n++) {
    const testLine = line + chars[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 650, y);
      line = chars[n];
      y += 65;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 650, y);

  // 하단 구분선
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(650, 530);
  ctx.lineTo(1150, 530);
  ctx.stroke();
  
  // 날씨 및 환율
  ctx.fillStyle = '#4b5563';
  ctx.font = '20px "NanumGothic", sans-serif';
  ctx.fillText(`🌡️ 서울 ${weatherTemp}°C`, 650, 555);
  ctx.fillText(`💵 USD ${usdRate}₫`, 830, 555);
  ctx.fillText(`💴 KRW ${krwRate}₫`, 1010, 555);

  return canvas.toBuffer('image/png');
}
