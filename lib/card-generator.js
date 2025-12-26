import { createCanvas, loadImage, registerFont } from "canvas";
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

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

  console.log("[CardImage] 🎯 이미지 URL:", imageUrl);

  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');

  // 1. 전체 배경 채우기 (깨끗한 화이트)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1200, 630);

  // 2. [상단 헤더 영역] 사용자 스케치 반영
  // "씬짜오베트남 오늘의 뉴스" (붉은색으로 변경 - 강력한 표기)
  ctx.fillStyle = '#8b0000'; 
  ctx.font = 'bold 48px "NanumGothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('씬짜오베트남 오늘의 뉴스', 600, 70);

  // 헤더 구분선
  ctx.strokeStyle = '#8b0000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50, 130);
  ctx.lineTo(1150, 130);
  ctx.stroke();

  // 3. [좌측 사진 영역] (약 550x430)
  try {
    console.log("[CardImage] 📥 이미지 다운로드 시작...");
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const contentType = response.headers['content-type'] || '';
    let buffer = Buffer.from(response.data);
    
    // WebP 형식인 경우 PNG로 변환
    if (contentType.includes('webp') || imageUrl.toLowerCase().endsWith('.webp')) {
      buffer = await sharp(buffer).png().toBuffer();
    }
    
    const image = await loadImage(buffer);
    
    const imgX = 50;
    const imgY = 160;
    const imgW = 550;
    const imgH = 430;
    
    const iw = image.width, ih = image.height;
    const r = Math.max(imgW / iw, imgH / ih);
    const nw = iw * r, nh = ih * r;
    
    ctx.save();
    ctx.beginPath();
    // roundRect 대신 일반 rect 사용 (호환성)
    ctx.rect(imgX, imgY, imgW, imgH);
    ctx.clip();
    ctx.drawImage(image, imgX + (imgW - nw) / 2, imgY + (imgH - nh) / 2, nw, nh);
    ctx.restore();
  } catch (e) {
    console.error("[CardImage] ❌ 이미지 로드 실패:", e.message);
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(50, 160, 550, 430);
  }

  // 4. [우측 텍스트 영역] (날짜 + 기사 제목)
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // 날짜 계산
  const now = new Date();
  const vietnamTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const dateStr = `${vietnamTime.getFullYear()}.${String(vietnamTime.getMonth() + 1).padStart(2, '0')}.${String(vietnamTime.getDate()).padStart(2, '0')}`;

  // 날짜 (붉은색으로 포인트)
  ctx.fillStyle = '#8b0000'; 
  ctx.font = 'bold 32px "NanumGothic", sans-serif';
  ctx.fillText(dateStr, 640, 170);

  // 기사 제목 (검은색, 크게 - 명조체 계열 적용)
  ctx.fillStyle = '#111827';
  // 뉴스 기사 느낌을 주는 명조체(serif) 계열 폰트 설정
  ctx.font = 'bold 56px "Batang", "NanumMyeongjo", serif';
  
  const maxWidth = 510;
  const chars = title.split('');
  let line = '';
  let textY = 240;

  for (let n = 0; n < chars.length; n++) {
    const testLine = line + chars[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 640, textY);
      line = chars[n];
      textY += 80;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 640, textY);

  // 5. [하단 경계 라인 추가] - 사용자 요청 사항
  // 이미지 맨 밑부분에 짙은 청색 라인을 넣어 하단 정보와 경계를 명확히 함
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 10; 
  ctx.beginPath();
  ctx.moveTo(0, 625);
  ctx.lineTo(1200, 625);
  ctx.stroke();

  return canvas.toBuffer('image/png');
}
