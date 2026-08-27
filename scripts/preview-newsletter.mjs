// 뉴스레터 템플릿 미리보기 — 실제 발송 없이 HTML 파일 하나를 뽑는다.
//
//   node scripts/preview-newsletter.mjs [출력경로]
//
// 왜 필요한가: 메일 디자인은 눈으로 봐야 판단이 된다. 그런데 확인하겠다고
// 실제 발송을 돌리면 6천 명에게 시험판이 나간다. 여기서 파일로만 뽑아 본다.
import { writeFileSync } from 'node:fs';
import { renderDailyNewsEmail } from '../lib/newsletter-template.js';

const out = process.argv[2] || 'newsletter-preview.html';

const html = renderDailyNewsEmail({
  dateString: '2026년 08월 27일 (목)',
  // 실제 카드뉴스는 1200x630(가로형)이다 (lib/card-generator.js). 미리보기에서 비율이
  // 다르면 디자인 판단이 어긋나므로 같은 비율의 자리표시 그림을 쓴다.
  cardImageUrl:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#FDBA74"/><stop offset="1" stop-color="#EA580C"/>' +
      '</linearGradient></defs>' +
      '<rect width="1200" height="630" fill="url(#g)"/>' +
      '<text x="60" y="300" fill="#FFFFFF" font-size="66" font-weight="bold" ' +
      'font-family="sans-serif">\uD638\uCC0C\uBBFC\u2013\uBD09\uB530\uC6B0 \uB3C4\uC2DC\uCCA0\uB3C4</text>' +
      '<text x="60" y="390" fill="#FFFFFF" font-size="66" font-weight="bold" ' +
      'font-family="sans-serif">51\uC5B5 \uB2EC\uB7EC \uADDC\uBAA8 \uCD94\uC9C4</text>' +
      '<rect x="60" y="450" width="90" height="5" fill="#FFFFFF"/>' +
      '<text x="60" y="530" fill="rgba(255,255,255,.7)" font-size="24" ' +
      'font-family="sans-serif">\uC624\uB298\uC758 \uCE74\uB4DC\uB274\uC2A4 (\uC790\uB9AC\uD45C\uC2DC)</text>' +
      '</svg>'
    ),
  terminalUrl: 'https://chaovietnam.co.kr/daily-news-terminal/?utm_source=email&utm_medium=newsletter&utm_content=terminal',
  brand: {
    publisherName: '씬짜오베트남',
    publisherNameEn: 'XIN CHAO VIETNAM',
    isSponsored: false,
    sponsor: {},
  },
  newsItems: [
    {
      title: '호찌민–붕따우 잇는 시속 120km 도시철도 추진… 51억 달러 규모',
      summary:
        '호찌민시 도심과 붕따우 국제공항을 연결하는 총연장 46.4km 규모의 도시철도 노선 건설에 약 134조 동(약 51억 2,000만 달러)이 투입된다. 오는 9월 2일 국경절을 전후해 착공식 예정이라고 베트남 현지 언론이 25일 보도했다.',
      url: 'https://chaovietnam.co.kr/186183/',
    },
    {
      title: '베트남 유명 여배우 연루 대형 마약 조직 적발… 도주 총책에 경고사격',
      summary:
        '베트남 공안이 대형 마약 유통 조직의 총책을 검거하는 과정에서 경고 사격을 했다. 이 조직에는 현지 유명 여배우가 연루된 것으로 알려져 파장이 커지고 있다.',
      url: 'https://chaovietnam.co.kr/186132/',
    },
    {
      title: "베트남 지역 특산물 신뢰 누가 지키나… '짝퉁 특산물' 논란",
      summary:
        '베트남의 인기 유통 채널에서 지역 특산품이 산지 표시 없이 대량 유통되면서, 지역 특산물의 진정성과 소비자 보호 문제가 수면 위로 떠올랐다. 전문가들은 지리적 표시제 강화와 체계적 감독이 필요하다고 지적했다.',
      url: 'https://chaovietnam.co.kr/186122/',
    },
    {
      title: '"증거 없이 1위 과장 광고"… 베트남 정수기 업체에 과징금',
      summary:
        "베트남 국가경쟁위원회가 '깐젠' 브랜드 정수기 제품을 세계 및 일본 1위 제품이라고 객관적 근거 없이 홍보한 판촉 행위에 대해 부당한 경쟁 행위로 2억 동(약 7,600달러)의 과징금을 부과했다.",
      url: 'https://chaovietnam.co.kr/186137/',
    },
  ],
  koreaNews: [
    { title: '엔비디아 3분기 LPX 양산 돌입… 삼성 파운드리 생산', url: 'https://chaovietnam.co.kr/k1/' },
    { title: '파나마 운하 통행 강수… 흑 컨테이너 물류 직격탄', url: 'https://chaovietnam.co.kr/k2/' },
    { title: '미 육군장관, 국방장관 강등 후 연내 사임 전망', url: 'https://chaovietnam.co.kr/k3/' },
    { title: '카이마시, 중북 중남미 경제성장 1위 전망… 16.2% 예측', url: 'https://chaovietnam.co.kr/k4/' },
  ],
  promoCards: [
    {
      title: '제12회 씬짜오 골프대회 참가자 모집',
      description: '10월 12일 롱탄 골프클럽에서 열립니다.\n교민 누구나 참가하실 수 있습니다.',
      imageUrl: '',
      linkUrl: 'https://chaovietnam.co.kr/promo/golf/',
    },
  ],
  baseUrl: 'https://chaovietnam.co.kr',
});

writeFileSync(out, html, 'utf8');
console.log(`preview written: ${out}  (${html.length.toLocaleString()} bytes)`);
