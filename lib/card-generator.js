import { createCanvas, loadImage } from "canvas";
import axios from 'axios';

export async function generateCardImageBuffer({
  title = "오늘의 뉴스",
  imageUrl = "", // 워드프레스 이미지 URL
  weatherTemp = "--",
  usdRate = "--",
  krwRate = "--",
}) {
  if (!imageUrl) {
    throw new Error("워드프레스 이미지 URL이 없습니다. 게시 여부를 확인해주세요.");
  }

  // 1. 도화지 준비 (1200x630)
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');

  // 2. 워드프레스 이미지 로드 (가장 안정적인 방식)
  let image;
  try {
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const buffer = Buffer.from(response.data);
    image = await loadImage(buffer); // 이미지 완전 로딩 대기
  } catch (e) {
    throw new Error(`워드프레스 이미지 로드 실패: ${e.message}. URL: ${imageUrl}`);
  }

  // 3. 이미지 그리기 (왼쪽 600px 영역에 맞춰 꽉 채움)
  const drawWidth = 600;
  const drawHeight = 630;
  const imgAspect = image.width / image.height;
  const targetAspect = drawWidth / drawHeight;

  let sw, sh, sx, sy;
  if (imgAspect > targetAspect) {
    sh = image.height;
    sw = sh * targetAspect;
    sx = (image.width - sw) / 2;
    sy = 0;
  } else {
    sw = image.width;
    sh = sw / targetAspect;
    sx = 0;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, 600, 630);

  // 4. 오른쪽 텍스트 영역 처리 (흰색 배경)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(600, 0, 600, 630);

  // 5. 제목 및 부가 정보 기입
  ctx.fillStyle = '#1f2937';
  ctx.textBaseline = 'top';
  
  // 제목 폰트 및 줄바꿈 (시스템 폰트 사용)
  ctx.font = 'bold 48px sans-serif';
  const maxWidth = 500;
  const chars = title.split('');
  let line = '';
  let y = 180;

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

  // 하단 날씨/환율 정보
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#4b5563';
  const infoText = `🌡️ 서울 ${weatherTemp}°C   💵 USD ${usdRate}₫   💴 KRW ${krwRate}₫`;
  ctx.fillText(infoText, 650, 560);

  return canvas.toBuffer('image/png');
}
