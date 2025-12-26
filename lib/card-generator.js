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

  // 1. 왼쪽 이미지 영역
  try {
    console.log("[CardImage] 📥 이미지 다운로드 시작...");
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    // ⭐ 중요: Content-Type 확인
    const contentType = response.headers['content-type'] || '';
    const contentLength = response.data?.byteLength || 0;
    
    console.log("[CardImage] 📥 응답 정보:", {
      status: response.status,
      contentType: contentType,
      contentLength: contentLength,
      url: imageUrl.substring(0, 100)
    });
    
    // Content-Type이 이미지가 아닌 경우
    if (!contentType.startsWith('image/')) {
      console.error("[CardImage] ❌ Content-Type이 이미지가 아님:", contentType);
      throw new Error(`지원하지 않는 Content-Type: ${contentType}. 이미지 URL이 올바른지 확인하세요.`);
    }
    
    if (!response.data || response.data.byteLength === 0) {
      throw new Error("빈 이미지 데이터를 받았습니다.");
    }
    
    // 이미지 데이터의 첫 몇 바이트 확인 (매직 넘버로 형식 확인)
    let buffer = Buffer.from(response.data);
    const magicBytes = buffer.slice(0, 4);
    console.log("[CardImage] 🔍 이미지 매직 바이트:", magicBytes.toString('hex'));
    
    // WebP 형식인 경우 PNG로 변환 (canvas가 WebP를 지원하지 않음)
    if (contentType.includes('webp') || imageUrl.toLowerCase().endsWith('.webp')) {
      console.log("[CardImage] 🔄 WebP 형식 감지됨 - PNG로 변환 중...");
      try {
        buffer = await sharp(buffer)
          .png()
          .toBuffer();
        console.log("[CardImage] ✅ WebP → PNG 변환 완료");
      } catch (convertError) {
        console.error("[CardImage] ❌ WebP 변환 실패:", convertError.message);
        throw new Error(`WebP 이미지 변환 실패: ${convertError.message}`);
      }
    }
    
    console.log("[CardImage] 🖼️ Canvas loadImage 시도...");
    const image = await loadImage(buffer);
    console.log("[CardImage] ✅ 이미지 로드 성공:", {
      width: image.width,
      height: image.height
    });
    
    const iw = image.width, ih = image.height;
    const r = Math.max(600 / iw, 630 / ih);
    const nw = iw * r, nh = ih * r;
    ctx.drawImage(image, (600 - nw) / 2, (630 - nh) / 2, nw, nh);
    console.log("[CardImage] ✅ 이미지 그리기 완료");
  } catch (e) {
    console.error("[CardImage] ❌ 이미지 로드 실패 상세:", {
      message: e.message,
      name: e.name,
      stack: e.stack?.split('\n').slice(0, 3).join('\n'),
      imageUrl: imageUrl.substring(0, 150)
    });
    throw new Error(`이미지 로드 실패: ${e.message}`);
  }

  // 2. 오른쪽 텍스트 영역
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(600, 0, 600, 630);

  ctx.textBaseline = 'top';
  
  // 날짜 계산
  const now = new Date();
  const vietnamTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const dateStr = `${vietnamTime.getFullYear()}.${String(vietnamTime.getMonth() + 1).padStart(2, '0')}.${String(vietnamTime.getDate()).padStart(2, '0')}`;
  
  // 1. 헤더: Xin Chào Vietnam (더 크고 명확하게)
  ctx.fillStyle = '#1e3a5f';
  ctx.font = 'bold 42px "NanumGothic", sans-serif';
  ctx.fillText('Xin Chào Vietnam', 650, 60);

  // 2. 서브헤더: 날짜 | 오늘의 뉴스 (금색 포인트)
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 28px "NanumGothic", sans-serif';
  ctx.fillText(`${dateStr}  |  오늘의 뉴스`, 650, 125);

  // 3. 메인 제목: 폰트 크기를 키우고 여백 확보
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 54px "NanumGothic", sans-serif'; 
  
  const maxWidth = 500;
  const chars = title.split('');
  let line = '';
  let y = 210;

  for (let n = 0; n < chars.length; n++) {
    const testLine = line + chars[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 650, y);
      line = chars[n];
      y += 75; // 줄 간격 확대
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 650, y);

  // ❌ 하단 기온, 환율 정보는 SNS 가독성을 위해 과감히 삭제

  return canvas.toBuffer('image/png');
}
