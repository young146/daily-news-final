import { createCanvas, loadImage, registerFont } from "canvas";
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// 폰트 등록 함수화 (다양한 폰트 지원)
const registerFonts = () => {
  const fontDir = path.join(process.cwd(), 'public', 'fonts');
  const fonts = [
    { file: 'NanumGothic-Bold.ttf', family: 'NanumGothic', weight: 'bold' },
    { file: 'NanumGothic-Regular.ttf', family: 'NanumGothic', weight: 'normal' },
    { file: 'NanumGothic-ExtraBold.ttf', family: 'NanumGothic', weight: '900' },
    { file: 'NanumMyeongjo-Bold.ttf', family: 'NanumMyeongjo', weight: 'bold' },
    { file: 'NanumMyeongjo-Regular.ttf', family: 'NanumMyeongjo', weight: 'normal' },
    // 한자(漢字) 폴백 — 나눔 폰트는 한글 전용이라 美·中·北·日 등 한자가 □로 깨짐.
    // KS X 1001 한자(4888자)만 subset한 Noto CJK KR을 폴백으로 등록(serif=제목, sans=요약).
    { file: 'NotoSerifKR-Bold-KSX.otf', family: 'NotoSerifKR', weight: 'bold' },
    { file: 'NotoSansKR-Bold-KSX.otf', family: 'NotoSansKR', weight: 'bold' }
  ];

  fonts.forEach(({ file, family, weight }) => {
    const fontPath = path.join(fontDir, file);
    if (fs.existsSync(fontPath)) {
      try {
        registerFont(fontPath, { family, weight });
        console.log(`[CardImage] ✅ Font registered: ${family} (${weight})`);
      } catch (err) {
        console.warn(`[CardImage] ⚠️ Font registration failed (${file}):`, err.message);
      }
    }
  });
};

try {
  registerFonts();
} catch (err) {
  console.error("[CardImage] ❌ Critical font registration error:", err.message);
}

// 이미지 소스(원격 URL / 로컬 파일경로 / data URI)를 가리지 않고 로드한다.
// - http(s): axios로 받고 webp면 sharp로 png 변환 후 디코드 (기존 사진 로딩 동작 보존)
// - 그 외: node-canvas loadImage가 파일경로/data URI를 직접 처리
async function loadAnyImage(src) {
  if (!src) throw new Error("이미지 소스가 없습니다.");
  if (/^https?:\/\//i.test(src)) {
    const response = await axios.get(src, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const contentType = response.headers['content-type'] || '';
    let buffer = Buffer.from(response.data);
    if (contentType.includes('webp') || src.toLowerCase().endsWith('.webp')) {
      buffer = await sharp(buffer).png().toBuffer();
    }
    return loadImage(buffer);
  }
  return loadImage(src);
}

export async function generateCardImageBuffer({
  title = "오늘의 뉴스",
  imageUrl = "",
  weatherTemp = "--",
  usdRate = "--",
  krwRate = "--",
  // 명명권(스폰서) 브랜딩: 로고가 있으면 헤더에 로고, 없으면 기존 텍스트
  sponsorName = "씬짜오베트남",
  sponsorLogoUrl = "",
  // 책임 크레딧 (스폰서 모드에서 카드 하단에 "제작 · XinChao | 후원 · 스폰서")
  cardCredit = "",
}) {
  if (!imageUrl) throw new Error("이미지 URL이 없습니다.");

  console.log("[CardImage] 🎯 이미지 URL:", imageUrl);

  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');

  // 1. 전체 배경 채우기 (깨끗한 화이트)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1200, 630);

  // 2. [상단 헤더 영역] — 명명권(스폰서) 브랜딩
  //    로고가 지정돼 있으면 헤더 중앙에 로고를 그리고, 없으면 기존 텍스트를 그린다.
  let headerDrawn = false;
  if (sponsorLogoUrl) {
    try {
      const logo = await loadAnyImage(sponsorLogoUrl);
      const maxH = 56, maxW = 520;
      const scale = Math.min(maxH / logo.height, maxW / logo.width);
      const lw = logo.width * scale, lh = logo.height * scale;
      ctx.drawImage(logo, 600 - lw / 2, 46 - lh / 2, lw, lh);
      // 로고 아래 "오늘의 뉴스" (브랜드명만 로고로 대체, 섹션 타이틀은 유지)
      ctx.fillStyle = '#8b0000';
      ctx.font = 'bold 30px "NanumGothic", "NotoSansKR", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('오늘의 뉴스', 600, 102);
      headerDrawn = true;
    } catch (e) {
      console.warn('[CardImage] ⚠️ 스폰서 로고 로드 실패, 텍스트로 대체:', e.message);
    }
  }
  if (!headerDrawn) {
    ctx.fillStyle = '#8b0000';
    ctx.font = 'bold 48px "NanumGothic", "NotoSansKR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${sponsorName} 오늘의 뉴스`, 600, 70);
  }

  // 헤더 구분선
  ctx.strokeStyle = '#8b0000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(50, 130);
  ctx.lineTo(1150, 130);
  ctx.stroke();

  // 3. [좌측 사진 영역] (약 550x430)
  try {
    console.log("[CardImage] 📥 이미지 로드 시작...");
    const image = await loadAnyImage(imageUrl);

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
  ctx.font = 'bold 32px "NanumGothic", "NotoSansKR", sans-serif';
  ctx.fillText(dateStr, 640, 170);

  // 기사 제목 (검은색, 크게 - 명조체 적용)
  ctx.fillStyle = '#111827';
  // 프로젝트에 포함된 나눔명조(NanumMyeongjo)를 최우선으로 사용
  ctx.font = 'bold 56px "NanumMyeongjo", "NotoSerifKR", serif';
  
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

  // 5. [하단 책임 크레딧] - 명명권(스폰서) 모드에서만
  //    SNS로 카드만 단독 유포될 때 "제작=씬짜오 / 후원=스폰서" 책임소재를 명확히 함
  if (cardCredit) {
    ctx.fillStyle = '#9aa0a6';
    ctx.font = '20px "NanumGothic", "NotoSansKR", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(cardCredit, 600, 610);
  }

  // 6. [하단 경계 라인 추가] - 사용자 요청 사항
  // 이미지 맨 밑부분에 짙은 청색 라인을 넣어 하단 정보와 경계를 명확히 함
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, 625);
  ctx.lineTo(1200, 625);
  ctx.stroke();

  return canvas.toBuffer('image/png');
}
