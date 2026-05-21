// 1회성 마이그레이션: PromoCard ID 6 의 안드로이드/iOS 분리 QR 2개 블록을
// "OS 자동 감지 통합 QR 1개" 블록으로 교체한다.
//
// QR/링크가 가리키는 URL: https://chaovietnam-login.web.app/go/app
//   - 이 페이지가 모바일 OS 를 감지해 App Store / Play Store / 앱 deep link 분기
//   - utm_* 파라미터 부착 → GA4 에서 "이메일 → 앱 QR" 전환 측정
//
// 안전장치: 마커가 정확히 한 번 매칭되지 않으면 중단(이미 적용됐거나 description 이 바뀐 경우).
// 이전 description 은 .tmp/office-discarded-2026-05-21/promocard-6-before-unified-qr.json 에 백업됨.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const UNIFIED_URL_QR   = 'https://chaovietnam-login.web.app/go/app?utm_source=email&utm_medium=newsletter&utm_content=app_qr';
const UNIFIED_URL_LINK = 'https://chaovietnam-login.web.app/go/app?utm_source=email&utm_medium=newsletter&utm_content=app_link';
const QR_IMG_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(UNIFIED_URL_QR)}`;

const NEW_BLOCK = `<h2>📲&nbsp;씬짜오베트남&nbsp;앱&nbsp;다운로드</h2>
<p>QR&nbsp;코드를&nbsp;스캔하면&nbsp;안드로이드&nbsp;·&nbsp;iOS&nbsp;를&nbsp;자동&nbsp;감지하여&nbsp;해당&nbsp;앱스토어로&nbsp;이동합니다.</p>
<p><a href="${UNIFIED_URL_QR}" target="_blank" rel="noopener noreferrer"><img src="${QR_IMG_URL}" alt="씬짜오베트남 앱 다운로드 QR" style="width:200px;height:200px;border-radius:8px;border:1px solid #ddd;display:inline-block;" /></a></p>
<p><a href="${UNIFIED_URL_LINK}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 28px;background:#ff6b35;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;">📱&nbsp;씬짜오베트남&nbsp;앱&nbsp;다운로드&nbsp;(클릭)</a></p>`;

const START_MARKER = '<h2><span style="background-color: rgb(255, 248, 240); color: rgb(51, 51, 51);">삼성폰';
const END_MARKER_FRAGMENT = '애플&nbsp;앱스토어&nbsp;앱&nbsp;다운로드&nbsp;(클릭)</a></h2>';

async function main() {
  const card = await prisma.promoCard.findUnique({ where: { id: 6 } });
  if (!card) throw new Error('PromoCard ID 6 을 찾을 수 없습니다.');

  const desc = card.description || '';
  const startIdx = desc.indexOf(START_MARKER);
  const endRaw = desc.indexOf(END_MARKER_FRAGMENT);

  if (startIdx === -1) {
    console.log('⚠️ 시작 마커("삼성폰" 블록) 못 찾음. 이미 적용됐을 가능성. 종료.');
    return;
  }
  if (endRaw === -1) {
    console.log('⚠️ 종료 마커(애플 앱스토어 링크) 못 찾음. description 이 예상과 다름. 종료.');
    return;
  }
  if (endRaw < startIdx) {
    throw new Error('마커 순서가 잘못됨. description 구조가 예상과 다름.');
  }

  const endIdx = endRaw + END_MARKER_FRAGMENT.length;
  const newDesc = desc.slice(0, startIdx) + NEW_BLOCK + desc.slice(endIdx);

  if (newDesc === desc) {
    console.log('변경 없음. 종료.');
    return;
  }

  await prisma.promoCard.update({
    where: { id: 6 },
    data: { description: newDesc },
  });

  console.log('✅ PromoCard ID 6 description 통합 QR 블록으로 교체 완료.');
  console.log(`   - 옛 길이: ${desc.length} → 새 길이: ${newDesc.length}`);
  console.log(`   - 통합 URL: ${UNIFIED_URL_LINK}`);
}

main()
  .catch((e) => { console.error('❌ 실패:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
