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

  const W = 1200, H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── 카드 구조 (2026-08-27 전면 개편, 사장님 지시) ──────────────────
  //   이전: 위에 빨간 "씬짜오베트남 오늘의 뉴스" 머리글 + 구분선,
  //         왼쪽 절반에 사진(550x430), 오른쪽 절반에 제목.
  //   지금: **사진이 카드 전체를 덮고, 그 위에 제목을 얹는다.**
  //
  //   왜: 머리글이 그림의 위 5분의 1을 차지하는데 정작 같은 말이 메일 머리에
  //       또 있었다. 사진을 반쪽만 쓰면 그날의 장면이 작아 눈에 안 들어온다.
  //       전면 사진 + 제목은 지금 뉴스 카드의 기본형이고, 메일에서 폭을 꽉 채웠을 때
  //       가장 세게 읽힌다.

  // 1. 바탕 (사진이 안 실릴 때를 대비한 색)
  ctx.fillStyle = '#101922';
  ctx.fillRect(0, 0, W, H);

  // 2. 사진을 카드 전체에 꽉 채운다 (비율 유지, 넘치는 쪽은 잘라낸다)
  try {
    console.log("[CardImage] 📥 이미지 로드 시작...");
    const image = await loadAnyImage(imageUrl);
    const iw = image.width, ih = image.height;
    const r = Math.max(W / iw, H / ih);
    const nw = iw * r, nh = ih * r;
    ctx.drawImage(image, (W - nw) / 2, (H - nh) / 2, nw, nh);
  } catch (e) {
    console.error("[CardImage] ❌ 이미지 로드 실패:", e.message);
    // 사진이 없어도 카드는 나가야 한다 — 제목만 얹힌 어두운 카드가 된다.
  }

  // 3. 아래쪽을 어둡게 깔아 준다.
  //    사진이 밝으면 흰 제목이 사라진다. 반투명 막을 아래에서 위로 그려
  //    제목이 앉는 자리만 어둡게 한다(사진 위쪽은 그대로 보인다).
  const scrim = ctx.createLinearGradient(0, H * 0.28, 0, H);
  scrim.addColorStop(0, 'rgba(6,10,14,0)');
  scrim.addColorStop(0.45, 'rgba(6,10,14,0.62)');
  scrim.addColorStop(1, 'rgba(6,10,14,0.92)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  // 4. 브랜드 표시 — 작게 왼쪽 위.
  //    큰 머리글은 없앴지만, 이 카드는 SNS·워드프레스로 단독 유포되므로
  //    "누가 만든 것인지" 는 남아야 한다.
  if (sponsorLogoUrl) {
    try {
      const logo = await loadAnyImage(sponsorLogoUrl);
      const maxH = 44, maxW = 300;
      const sc = Math.min(maxH / logo.height, maxW / logo.width);
      ctx.drawImage(logo, 54, 46, logo.width * sc, logo.height * sc);
    } catch (e) {
      console.warn('[CardImage] ⚠️ 스폰서 로고 로드 실패:', e.message);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 26px "NanumGothic", "NotoSansKR", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(sponsorName, 54, 48);
  }

  // 5. 제목 — 아래쪽에 앉힌다. 사진 위이므로 흰색, 그리고 그림자로 한 번 더 띄운다.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 62px "NanumMyeongjo", "NotoSerifKR", serif';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 2;

  // 줄바꿈: 글자를 하나씩 넣어 보며 폭을 넘으면 끊는다(한글은 단어 단위가 무의미).
  const maxWidth = W - 108;   // 좌우 54px 씩 여백
  const lines = [];
  let line = '';
  for (const ch of String(title)) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  // 너무 길면 아래에서 세 줄까지만 (그 이상이면 사진이 다 가려진다)
  const shown = lines.slice(0, 3);
  if (lines.length > 3) shown[2] = shown[2].slice(0, -1) + '…';

  const lineH = 78;
  const bottomPad = cardCredit ? 108 : 68;
  let y = H - bottomPad - (shown.length - 1) * lineH;
  for (const l of shown) {
    ctx.fillText(l, 54, y);
    y += lineH;
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 6. 책임 크레딧 — 명명권(스폰서) 모드에서만.
  //    SNS 로 카드만 단독 유포될 때 "제작=씬짜오 / 후원=스폰서" 를 밝힌다.
  if (cardCredit) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '20px "NanumGothic", "NotoSansKR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cardCredit, W / 2, H - 34);
  }

  return canvas.toBuffer('image/png');
}
