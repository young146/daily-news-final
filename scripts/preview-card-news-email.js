// 데일리 뉴스 이메일 *전체* 미리보기 — 발송 없이 HTML 만 생성해서 .tmp/preview.html 에 저장.
// 사용법: node scripts/preview-card-news-email.js
//
// generateCardNewsHtml 로직은 send-daily-email.js 에서 그대로 복제 (Next.js path alias 우회).
// 발송 본 함수와 동기화 유지 책임은 작은 디자인 변경 시에만 — 미리보기 전용.

const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');

const prisma = new PrismaClient();

// send-daily-email.js generateCardNewsHtml 의 미리보기 복제본
// (실제 발송과 시각 동일하게 유지. 발송 로직 변경 시 함께 갱신.)
function generateCardNewsHtml(dateString, cardImageUrl, terminalUrl, newsItems, promoCards = [], appFunnel = null) {
  const baseUrl = 'https://chaovietnam.co.kr';
  const trackUrl = (target) => target || '#'; // 미리보기에서는 click tracking 우회

  const topBannerUrl = 'https://chaovietnam-login.web.app/go/app?utm_source=email&utm_medium=newsletter&utm_content=email_top_banner';
  const topBannerHtml = `
    <a href="${topBannerUrl}" target="_blank" style="text-decoration:none;display:block;margin-bottom:20px;">
      <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:#7c2d12;">
        <span style="line-height:1.4;">📱 <strong>매일 이메일 + 실시간 알림</strong>은 앱에서. 24년 베트남 한인 미디어, 이제 모바일로.</span>
        <span style="background:#f97316;color:#fff;padding:6px 14px;border-radius:6px;font-weight:700;white-space:nowrap;font-size:12px;">앱 설치 →</span>
      </div>
    </a>
  `;

  let html = `
    <div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 20px; background-color: #fff;">
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">씬짜오베트남 데일리뉴스 | ${dateString}</h2>
      <h1 style="font-size: 24px; color: #d1121d; margin-bottom: 20px;">씬짜오베트남 오늘의 뉴스</h1>
      ${topBannerHtml}
  `;

  if (cardImageUrl) {
    html += `<div style="margin-bottom: 30px;"><a href="${trackUrl(terminalUrl)}" target="_blank" style="text-decoration: none;"><img src="${cardImageUrl}" alt="오늘의 뉴스 카드" style="max-width: 100%; height: auto; display: block; border: 1px solid #eee;" /></a></div>`;
  }

  (newsItems || []).forEach(item => {
    const url = item.wordpressUrl || terminalUrl;
    const summary = (item.translatedSummary || item.summary || '').replace(/\n/g, '<br/>');
    html += `
      <div style="margin-bottom: 25px; line-height: 1.6;">
        <h3 style="font-size: 16px; font-weight: bold; margin: 0 0 8px 0; color: #222;">📍 ${item.translatedTitle || item.title}</h3>
        <p style="font-size: 14px; margin: 0 0 8px 0; color: #444;">${summary}</p>
        <div style="font-size: 13px;"><a href="${trackUrl(url)}" style="color: #0056b3; text-decoration: underline; word-break: break-all;" target="_blank">자세한 내용은 링크를 클릭: ${url}</a></div>
      </div>
    `;
  });

  // 깔때기 단계 1 보강: 새 채용/부동산/중고 섹션 (3채널 동기화)
  if (appFunnel && (appFunnel.newJobs > 0 || appFunnel.newRealEstate > 0 || appFunnel.newItems > 0)) {
    const appBannerUrl = 'https://chaovietnam-login.web.app/go/app?utm_source=email&utm_medium=newsletter&utm_content=daily_app_funnel';
    const parts = [];
    if (appFunnel.newJobs > 0) parts.push(`💼 새 채용 <strong>${appFunnel.newJobs}건</strong>`);
    if (appFunnel.newRealEstate > 0) parts.push(`🏠 새 매물 <strong>${appFunnel.newRealEstate}건</strong>`);
    if (appFunnel.newItems > 0) parts.push(`🛒 새 물품 <strong>${appFunnel.newItems}건</strong>`);
    html += `
      <div style="margin: 30px 0; padding: 16px 18px; background: linear-gradient(135deg, #fff8f0 0%, #fef3e2 100%); border-left: 4px solid #f97316; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #c2410c;">📲 오늘 (24시간) 베트남 한인 사회 새 소식</p>
        <p style="margin: 0 0 10px 0; font-size: 13px; color: #555; line-height: 1.6;">${parts.join(' · ')}이 등록되었습니다.</p>
        <a href="${appBannerUrl}" target="_blank" style="display: inline-block; padding: 8px 16px; background: #f97316; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 700;">앱에서 자세히 보기 →</a>
      </div>
    `;
  }

  if (promoCards && promoCards.length > 0) {
    html += `<div style="margin-top: 40px; padding: 24px; background-color: #fff8f0; border: 2px solid #f97316; border-radius: 12px;">
      <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: bold; color: #c2410c; text-align: center;">📣 함께 홍보하기</p>
      <p style="margin: 0 0 20px 0; font-size: 13px; color: #92400e; text-align: center;">제목을 클릭하여 자세히 알아보세요!</p>`;

    promoCards.forEach(card => {
      const trackedPromoUrl = trackUrl(card.linkUrl);
      const imgHtml = card.imageUrl
        ? `<a href="${trackedPromoUrl}" target="_blank"><img src="${card.imageUrl}" alt="${card.title}" style="width:100%;height:auto;border-radius:8px;display:block;margin-bottom:12px;" /></a>`
        : '';
      const descHtml = card.description
        ? `<div style="font-size:13px;color:#555;margin:8px 0;line-height:1.5;">${card.description}</div>`
        : '';

      // 앱 다운로드 카드는 description 안에 이미 자체 CTA 버튼이 있으므로 외부 "자세히 보기" 생략
      const moreButtonHtml = card.category === 'app' ? '' : `
          <a href="${trackedPromoUrl}" target="_blank"
            style="display:inline-block;margin-top:10px;padding:8px 20px;background:#f97316;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;">
            자세히 보기 →
          </a>`;

      html += `
        <div style="margin-bottom:16px;background:#fff;border:1px solid #fed7aa;border-radius:10px;padding:16px;">
          ${imgHtml}
          <h3 style="margin:0 0 4px 0;font-size:15px;font-weight:bold;"><a href="${trackedPromoUrl}" target="_blank" style="color:#c2410c;text-decoration:none;">${card.title}</a></h3>
          ${descHtml}${moreButtonHtml}
        </div>
      `;
    });

    html += `</div>`;
  }

  html += `
    <div style="margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px;">
      <div style="font-size: 12px; color: #666; line-height: 1.6;">
        <p style="margin: 0 0 5px 0;"><strong>HANHOA CO., LTD | www.chaovietnam.co.kr</strong></p>
        <p style="margin: 0 0 5px 0;">9Th Floor, EBM Building, 685-685 Dien Bien Phu, Ward 25, Binh Thanh</p>
        <p style="margin: 0;">T. 028)3511 1075 / 3511 1095 | E. info@chaovietnam.co.kr</p>
      </div>
    </div></div>`;

  return html;
}

async function main() {
  const promoCards = await prisma.promoCard.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  const recentNews = await prisma.newsItem.findMany({
    where: { status: 'PUBLISHED', isCardNews: true },
    orderBy: { publishedAt: 'desc' },
    take: 3,
  });

  // 미리보기에서는 appFunnel 모의 데이터 (실제 발송과 동일한 시각 확인)
  const appFunnel = { newJobs: 3, newRealEstate: 2, newItems: 5, jobsSample: [] };

  const todayString = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  const html = generateCardNewsHtml(
    todayString,
    null,
    'https://chaovietnam.co.kr/daily-news-terminal/',
    recentNews,
    promoCards,
    appFunnel,
  );

  const outDir = path.join(process.cwd(), '.tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'preview-card-news-email.html');
  fs.writeFileSync(outFile, html, 'utf8');

  console.log(`✅ 전체 이메일 미리보기: ${outFile}`);
  console.log(`   브라우저에서 열어서 확인. PromoCard 3개 + 통합 QR + "자세히 보기" 분기 동작 체크.`);
}

main()
  .catch((e) => { console.error('❌ 실패:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
