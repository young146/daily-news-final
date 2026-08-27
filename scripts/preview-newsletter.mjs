// 뉴스레터 템플릿 미리보기 — 실제 발송 없이 HTML 파일 하나를 뽑는다.
//
//   node scripts/preview-newsletter.mjs [출력경로]
//
// 왜 필요한가: 메일 디자인은 눈으로 봐야 판단이 된다. 그런데 확인하겠다고
// 실제 발송을 돌리면 6천 명에게 시험판이 나간다. 여기서 파일로만 뽑아 본다.
import { writeFileSync } from 'node:fs';
import { renderDailyNewsEmail } from '../lib/newsletter-template.js';

const out = process.argv[2] || 'newsletter-preview.html';

/** 자리표시 그림 (실제로는 그날의 사진이 들어간다) */
function ph(w, h, text, from = '#2E4257', to = '#101922', fs = 66) {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
      `</linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
      (text
        ? `<text x="50%" y="52%" fill="rgba(255,255,255,.55)" font-size="${fs}" ` +
          `font-family="sans-serif" text-anchor="middle">${text}</text>`
        : '') +
      `</svg>`
    )
  );
}

const html = renderDailyNewsEmail({
  dateString: '2026년 08월 27일 (목)',

  // 실제 카드뉴스는 1200x630 이고, 이제 **사진이 전체를 덮고 그 위에 제목**이 얹힌다
  // (lib/card-generator.js 2026-08-27 개편). 비율과 분위기를 같게 맞춘 자리표시.
  cardImageUrl:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">' +
      '<stop offset="0" stop-color="#3A5570"/><stop offset="1" stop-color="#0C141C"/>' +
      '</linearGradient>' +
      '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0.3" stop-color="rgba(6,10,14,0)"/>' +
      '<stop offset="1" stop-color="rgba(6,10,14,.92)"/>' +
      '</linearGradient></defs>' +
      '<rect width="1200" height="630" fill="url(#g)"/>' +
      '<rect width="1200" height="630" fill="url(#s)"/>' +
      '<text x="54" y="74" fill="rgba(255,255,255,.92)" font-size="26" font-weight="bold" ' +
      'font-family="sans-serif">씨짜오베트남</text>' +
      '<text x="54" y="486" fill="#FFFFFF" font-size="62" font-weight="bold" ' +
      'font-family="sans-serif">호찌민–봉따우 잇는</text>' +
      '<text x="54" y="564" fill="#FFFFFF" font-size="62" font-weight="bold" ' +
      'font-family="sans-serif">시속 120km 도시철도</text>' +
      '</svg>'
    ),

  terminalUrl: 'https://chaovietnam.co.kr/daily-news-terminal/?utm_source=email&utm_medium=newsletter&utm_content=terminal',
  brand: {
    publisherName: '씬짜오베트남',
    publisherNameEn: 'XIN CHAO VIETNAM',
    isSponsored: false,
    sponsor: {},
  },

  // ⚠️ 톱뉴스는 여기 없다 — 위 큰 사진이 톱뉴스다 (route.js 에서 걸러 보낸다).
  //    작은 사진 + 제목만, 다섯 줄.
  newsItems: [
    {
      title: '베트남 유명 여배우 연루 대형 마약 조직 적발… 도주 총책에 경고사격',
      imageUrl: ph(240, 160, '', '#5A3A44', '#1A1014'),
      url: 'https://chaovietnam.co.kr/186132/',
    },
    {
      title: "베트남 지역 특산물 신뢰 누가 지키나… '짝퉁 특산물' 논란",
      imageUrl: ph(240, 160, '', '#3E5642', '#12190F'),
      url: 'https://chaovietnam.co.kr/186122/',
    },
    {
      title: '"증거 없이 1위 과장 광고"… 베트남 정수기 업체에 과징금',
      imageUrl: ph(240, 160, '', '#2F4A5E', '#101820'),
      url: 'https://chaovietnam.co.kr/186137/',
    },
    {
      title: '하노이 아파트 시장, 거래량 감소 및 가격 약세 지속',
      imageUrl: '',   // 사진이 없는 기사 — 자리표시 네모가 나와야 한다
      url: 'https://chaovietnam.co.kr/186140/',
    },
    {
      title: '베트남–중국 국경 간 QR 결제 시스템 도입 발표',
      imageUrl: ph(240, 160, '', '#54463A', '#1A1512'),
      url: 'https://chaovietnam.co.kr/186145/',
    },
  ],

  koreaNews: [
    { title: '엔비디아 3분기 LPX 양산 돌입… 삼성 파운드리 생산', url: 'https://chaovietnam.co.kr/k1/' },
    { title: '파나마 운하 통행 강수… 흑 컨테이너 물류 직격탄', url: 'https://chaovietnam.co.kr/k2/' },
    { title: '미 육군장관, 국방장관 강등 후 연내 사임 전망', url: 'https://chaovietnam.co.kr/k3/' },
    { title: '카이마시, 중북 중남미 경제성장 1위 전망… 16.2% 예측', url: 'https://chaovietnam.co.kr/k4/' },
  ],

  // ⚠️ 광고 설명은 통합광고센터 편집기에서 **HTML 로** 저장된다.
  //    여기 일부러 지저분한 실제 형태를 넣어 둔다 — 미리보기가 이걸 못 걸러내면
  //    메일에 <h2> <span style=...> 가 글자로 찍혀 나간다(2026-08-27 실제 발생).
  promoCards: [
    {
      title: '성우종합인쇄 - 컬러박스·쇼핑백·카다록 일괄 제작',
      description:
        '<h2><strong style="color: rgb(0, 0, 0);">뉴스레터에서&nbsp;관심을&nbsp;만들고,&nbsp;' +
        '앱과&nbsp;뉴스터미널에서&nbsp;브랜드를&nbsp;다시&nbsp;만나게&nbsp;합니다.</strong></h2>' +
        '<h2></h2><p><span style="color: lab(35.5623 -1.74978 -15.4316); ' +
        'background-color: rgb(255, 255, 255);">🎨&nbsp;인쇄가&nbsp;필요한&nbsp;모든&nbsp;것,&nbsp;' +
        '한&nbsp;곳에서&nbsp;해결하세요.</span></p>',
      imageUrl: '',
      linkUrl: 'https://chaovietnam.co.kr/promo/print/',
    },
  ],

  baseUrl: 'https://chaovietnam.co.kr',
});

writeFileSync(out, html, 'utf8');
console.log(`preview written: ${out}  (${html.length.toLocaleString()} bytes)`);
