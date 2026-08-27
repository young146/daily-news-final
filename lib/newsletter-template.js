// 데일리 뉴스레터 이메일 템플릿 (2026-08-27)
//
// 1차 개편에서 고친 것 — 사장님: "너무 19세기 스타일이라 내가 늙은이라는 걸 알려주는 것 같다."
// 낡아 보이게 만든 것은 취향이 아니라 아래 다섯 가지였다:
//   ① 본문에 날 URL 을 그대로 인쇄 ("자세한 내용은 링크를 클릭: https://...")
//      → 제목 자체가 링크여야 한다. 주소를 눈에 보이게 적는 건 2000년대 관습이다.
//   ② 📍 이모지 불릿 → 01·02 번호 (사람이 골라준 느낌이 난다)
//   ③ 좁은 여백 + 14px 본문 → 16px 기준
//   ④ 흰 바탕에 요소가 그냥 얹혀 있음 → 배경 위에 카드가 뜨는 구조
//   ⑤ preheader 없음 → 받은편지함에서 제목 옆이 비어 보였다
//
// 2차 개편에서 고친 것 (사장님 지시):
//   ⑥ **검은색(딥그린) 블록을 다 걷어냈다.** 씬짜오 색은 밝은 오렌지이고,
//      전체 톤도 밝아야 한다. 어두운 헤더·푸터·한국뉴스 상자를 전부 밝게 바꿨다.
//   ⑦ **제목 자리에 로고를 넣었다** (logo-full.png — 삿갓 + Xin Chao Vietnam).
//   ⑧ **머리 높이를 최소로.** 로고 한 줄 + 날짜 한 줄이면 끝. 그 아래 곧바로
//      톱뉴스 카드가 온다 — 카드 그림 자체가 '사진 위에 제목' 이므로
//      여기서 제목을 또 얹지 않는다(두 번 나온다).
//   ⑨ **폭을 넓혔다.** 600px 은 열었을 때 화면 가운데 좁은 기둥처럼 보인다.
//
// ⚠️ 이메일 HTML 은 웹과 규칙이 다르다. 아래는 취향이 아니라 제약이다:
//   · 레이아웃은 <table> 로. Outlook 데스크탑은 Word 엔진이라 flex/grid 를 못 쓴다.
//   · 모든 스타일은 인라인. <style> 은 Gmail 등에서 일부만 살아남는다.
//   · 웹폰트 금지 — 대부분 클라이언트가 막는다. 시스템 폰트 스택을 쓴다.
//   · 이미지는 꺼진 채로 열리는 경우가 흔하다 → alt 필수.
//     그래서 로고에도 alt 를 넣고, 로고가 안 떠도 아래 날짜·본문으로 뜻이 통하게 둔다.
//   · CSS background-image 는 Outlook 이 무시한다 → 사진 위 글자는 만들지 않는다.
//   · 버튼은 <button> 이 아니라 테이블+배경색("bulletproof button").

const ORANGE = '#F97316';       // 씬짜오 밝은 오렌지 — 강조·버튼
const ORANGE_DEEP = '#EA580C';  // 흰 바탕 위 글자용 (밝은 오렌지는 흰 배경에서 흐리다)
const ORANGE_SOFT = '#FFF3E9';  // 오렌지 아주 옅게 — 강조 상자 바탕
const ORANGE_LINE = '#FFD9BC';  // 오렌지 옅은 테두리
const CREAM = '#FDF9F4';        // 봉투 바탕
const PAPER = '#FFFFFF';        // 카드
const HEAD = '#231A14';         // 제목 글자 (검정 대신 따뜻한 진갈색)
const TEXT = '#4A4441';         // 본문
const MUTE = '#9A9089';         // 보조
const LINE = '#F0E7DE';         // 해어라인

const FONT =
  "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic'," +
  "'맑은 고딕','Noto Sans KR',Roboto,'Helvetica Neue',Arial,sans-serif";

// 메일에 넣을 그림은 **인터넷에서 열리는 주소**여야 한다. 로컬 파일 경로는 안 뜬다.
const LOGO_URL = 'https://daily-news-final.vercel.app/logo-full.png';

/** 봉투 폭. 600px 은 열었을 때 화면 가운데 좁은 기둥으로 보인다 → 넓혔다.
 *  다만 무한정 넓히면 한 줄이 너무 길어져 읽기가 힘들어지므로 상한은 둔다. */
const MAXW = 1000;

/** HTML 특수문자 이스케이프 — 제목에 &, < 가 들어와도 깨지지 않게 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 받은편지함에서 제목 옆에 뜨는 미리보기 문구. 안 넣으면 본문 첫 글자가 아무렇게나 딸려간다. */
function preheader(text) {
  return (
    `<div style="display:none;font-size:1px;color:${CREAM};line-height:1px;` +
    `max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(text)}` +
    '&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;'.repeat(15) +
    '</div>'
  );
}

/** 카드 안의 블록을 담는 한 칸짜리 행 */
function row(inner, pad = '0 40px') {
  return `<tr><td class="pad" style="padding:${pad};">${inner}</td></tr>`;
}

/** Outlook 에서도 눌리는 버튼 (배경색이 들어간 테이블) */
function button(href, label) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${ORANGE}" style="border-radius:999px;">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:15px 36px;font-family:${FONT};font-size:15px;
                  font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">
          ${esc(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

/** 얇은 구분선 */
const hairline = `<div style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</div>`;

// ── 머리 — 로고 한 줄, 날짜 한 줄. 높이를 최소로 ──────────────────────
// 제목 글자를 크게 넣지 않는다. 바로 아래 오는 카드 그림이 이미 '사진 위에 제목' 이라,
// 여기서 또 제목을 쓰면 같은 말이 두 번 나온다.
function headerBlock({ dateString, sponsor, publisherNameEn, isSponsored }) {
  const sponsorLine = isSponsored
    ? `
      <div style="padding-top:10px;">
        <span style="font-family:${FONT};font-size:10px;letter-spacing:.16em;color:${MUTE};
                     vertical-align:middle;">SPONSORED BY</span>
        &nbsp;
        ${sponsor.logoUrl
          ? `<img src="${sponsor.logoUrl}" alt="${esc(sponsor.name)}" height="22"
                  style="height:22px;vertical-align:middle;border:0;" />`
          : `<span style="font-family:${FONT};font-size:15px;font-weight:700;
                          color:${ORANGE_DEEP};vertical-align:middle;">${esc(sponsor.name)}</span>`}
      </div>`
    : '';

  return `
  <tr>
    <td class="pad" style="padding:22px 40px 18px;background:${PAPER};" align="center">
      <img src="${LOGO_URL}" alt="${esc(publisherNameEn || 'Xin Chao Vietnam')}"
           width="176" style="width:176px;max-width:60%;height:auto;display:block;
                              margin:0 auto;border:0;" />
      <div style="font-family:${FONT};font-size:12.5px;letter-spacing:.04em;color:${MUTE};
                  padding-top:10px;">
        데일리뉴스 &nbsp;·&nbsp; ${esc(dateString)}
      </div>
      ${sponsorLine}
    </td>
  </tr>`;
}

// ── 기사 한 꼭지 ──────────────────────────────────────────────────────
// 번호를 붙인다 — "오늘 고른 네 꼭지" 라는 편집된 느낌이 생긴다.
// 제목이 곧 링크다. 주소를 본문에 인쇄하지 않는다.
function newsItem(item, index, isLast) {
  const summary = String(item.summary || '').split('\n').map(esc).join('<br/>');
  return `
  <tr>
    <td class="pad" style="padding:0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:${index === 0 ? '30px' : '26px'} 0 ${isLast ? '30px' : '26px'};">
            <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.16em;
                        color:${ORANGE_DEEP};padding-bottom:9px;">
              ${String(index + 1).padStart(2, '0')}
            </div>
            <a href="${item.url}" target="_blank" class="title"
               style="font-family:${FONT};font-size:20px;line-height:1.45;font-weight:700;
                      color:${HEAD};text-decoration:none;display:block;letter-spacing:-.01em;">
              ${esc(item.title || '')}
            </a>
            ${summary ? `
            <div style="font-family:${FONT};font-size:15.5px;line-height:1.8;color:${TEXT};
                        padding-top:12px;">${summary}</div>` : ''}
            <div style="padding-top:14px;">
              <a href="${item.url}" target="_blank"
                 style="font-family:${FONT};font-size:13px;font-weight:700;color:${ORANGE_DEEP};
                        text-decoration:none;">기사 전문 보기 &rarr;</a>
            </div>
          </td>
        </tr>
      </table>
      ${isLast ? '' : hairline}
    </td>
  </tr>`;
}

// ── 오늘 한국에선 — 옅은 오렌지 상자 ──────────────────────────────────
function koreaBlock(koreaNews) {
  const items = koreaNews.map((n, i) => `
    <tr>
      <td style="padding:${i === 0 ? '0' : '12px'} 0 0;">
        <a href="${n.url}" target="_blank"
           style="font-family:${FONT};font-size:15px;line-height:1.55;font-weight:600;
                  color:${HEAD};text-decoration:none;">
          ${esc(n.title)} <span style="color:${ORANGE};">&rarr;</span>
        </a>
      </td>
    </tr>`).join('');

  return row(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${ORANGE_SOFT};border:1px solid ${ORANGE_LINE};border-radius:16px;">
      <tr>
        <td style="padding:24px 28px 26px;">
          <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.2em;
                      color:${ORANGE_DEEP};padding-bottom:16px;">
            오늘 한국에선
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${items}
          </table>
        </td>
      </tr>
    </table>`, '12px 40px 0');
}

// ── 홍보 카드 ─────────────────────────────────────────────────────────
function promoBlock(promoCards) {
  const cards = promoCards.map((c) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${PAPER};border:1px solid ${LINE};border-radius:16px;
                  margin-bottom:16px;">
      ${c.imageUrl ? `
      <tr>
        <td>
          <a href="${c.linkUrl}" target="_blank" style="display:block;">
            <img src="${c.imageUrl}" alt="${esc(c.title)}" width="${MAXW - 80}"
                 style="width:100%;height:auto;display:block;border:0;
                        border-radius:16px 16px 0 0;" />
          </a>
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:22px 24px 24px;">
          <div style="font-family:${FONT};font-size:17px;font-weight:700;color:${HEAD};
                      line-height:1.45;">${esc(c.title)}</div>
          ${c.description ? `
          <div style="font-family:${FONT};font-size:14.5px;line-height:1.75;color:${TEXT};
                      padding-top:10px;white-space:pre-wrap;">${esc(c.description)}</div>` : ''}
          ${c.linkUrl ? `
          <div style="padding-top:16px;">
            <a href="${c.linkUrl}" target="_blank"
               style="font-family:${FONT};font-size:13px;font-weight:700;color:${ORANGE_DEEP};
                      text-decoration:none;">자세히 보기 &rarr;</a>
          </div>` : ''}
        </td>
      </tr>
    </table>`).join('');

  return row(`
    <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.2em;
                color:${ORANGE_DEEP};padding:8px 0 14px;">함께 홍보해요</div>
    ${cards}`, '28px 40px 0');
}

// ── 씬짜오 자산 안내 — 밖으로 나가는 유일한 창구 ──────────────────────
// 주소는 vnkorlife.com/m 하나만 쓴다(서버가 "이메일에서 왔다" 꼬리표를 붙여 넘긴다).
// 앱·카톡방·매거진 주소를 여기 늘어놓지 않는 이유: 넷을 한꺼번에 보면 아무 데도 안 간다.
function assetsBlock() {
  return row(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${ORANGE_SOFT};border:1px solid ${ORANGE_LINE};border-radius:16px;">
      <tr>
        <td style="padding:28px;" align="center">
          <div style="font-family:${FONT};font-size:17px;font-weight:700;color:${HEAD};
                      line-height:1.5;">
            씬짜오 앱 · 매거진 · 옐로페이지
          </div>
          <div style="font-family:${FONT};font-size:14.5px;line-height:1.75;color:${TEXT};
                      padding:10px 0 20px;">
            뉴스 · 환율 · 구인 · 부동산을 한 곳에서.<br/>
            베트남 생활에 필요한 것들을 모아 두었습니다.
          </div>
          ${button('https://vnkorlife.com/m', '씬짜오 서비스 둘러보기')}
        </td>
      </tr>
    </table>`, '28px 40px 0');
}

// ── 푸터 — 밝게 ───────────────────────────────────────────────────────
function footerBlock({ baseUrl }) {
  return `
  <tr>
    <td class="pad" style="padding:0 40px 34px;background:${PAPER};" align="center">
      ${hairline}
      <div style="font-family:${FONT};font-size:12.5px;font-weight:700;color:${HEAD};
                  padding-top:24px;">
        HANHOA CO., LTD
      </div>
      <div style="font-family:${FONT};font-size:12px;line-height:1.8;color:${MUTE};
                  padding-top:7px;">
        9th Floor, EBM Building, 685 Dien Bien Phu, Binh Thanh, HCMC<br/>
        T. 028-3511-1075 &nbsp;·&nbsp; info@chaovietnam.co.kr
      </div>
      <div style="font-family:${FONT};font-size:11.5px;line-height:1.7;color:${MUTE};
                  padding-top:18px;">
        이 메일은 씬짜오베트남 뉴스레터 구독자에게 보내드립니다.<br/>
        <a href="${baseUrl}/unsubscribe" target="_blank"
           style="color:${MUTE};text-decoration:underline;">수신 거부</a>
      </div>
    </td>
  </tr>`;
}

/**
 * 데일리 뉴스레터 전체 HTML.
 *
 * @param {object} o
 * @param {string} o.dateString      2026년 08월 27일 (목)
 * @param {string} o.cardImageUrl    카드뉴스 이미지 (사진 위에 톱뉴스 제목이 이미 얹혀 있다)
 * @param {string} o.terminalUrl     뉴스 터미널 주소 (UTM 붙은 것)
 * @param {Array}  o.newsItems       [{ title, summary, url }]
 * @param {Array}  o.koreaNews       [{ title, url }]
 * @param {Array}  o.promoCards      [{ title, description, imageUrl, linkUrl }]
 * @param {object} o.brand           { publisherName, publisherNameEn, isSponsored, sponsor }
 * @param {string} o.baseUrl
 */
export function renderDailyNewsEmail(o) {
  const {
    dateString, cardImageUrl, terminalUrl,
    newsItems = [], koreaNews = [], promoCards = [],
    brand = {}, baseUrl = 'https://chaovietnam.co.kr',
  } = o;

  const topHeadline = newsItems[0]?.title || '오늘의 베트남 소식을 전해 드립니다.';

  return `<!DOCTYPE html>
<html lang="ko" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />
<title>${esc(`씬짜오 데일리뉴스 ${dateString}`)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  /* 이 블록은 Gmail 등 일부에서만 산다 — 없어도 읽히도록 인라인으로 다 박아뒀다 */
  body{margin:0;padding:0;width:100%!important;}
  img{-ms-interpolation-mode:bicubic;}
  a{color:${ORANGE_DEEP};}
  @media only screen and (max-width:${MAXW + 20}px){
    .wrap{width:100%!important;max-width:100%!important;}
  }
  @media only screen and (max-width:620px){
    .pad{padding-left:20px!important;padding-right:20px!important;}
    .title{font-size:18px!important;}
    .gutter{padding-left:0!important;padding-right:0!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
${preheader(topHeadline)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${CREAM};">
  <tr>
    <td class="gutter" align="center" style="padding:16px 10px 28px;">

      <table role="presentation" class="wrap" width="${MAXW}" cellpadding="0" cellspacing="0" border="0"
             style="width:${MAXW}px;max-width:${MAXW}px;background:${PAPER};
                    border-radius:16px;overflow:hidden;">

        ${headerBlock({
          dateString,
          sponsor: brand.sponsor || {},
          publisherNameEn: brand.publisherNameEn,
          isSponsored: !!brand.isSponsored,
        })}

        ${cardImageUrl ? `
        <tr>
          <td>
            <a href="${terminalUrl}" target="_blank" style="display:block;">
              <img src="${cardImageUrl}" alt="${esc(topHeadline)}" width="${MAXW}"
                   style="width:100%;height:auto;display:block;border:0;" />
            </a>
          </td>
        </tr>` : ''}

        ${newsItems.map((it, i) => newsItem(it, i, i === newsItems.length - 1)).join('')}

        ${newsItems.length ? row(hairline, '0 40px') : ''}

        ${koreaNews.length ? koreaBlock(koreaNews) : ''}

        <tr>
          <td class="pad" style="padding:30px 40px 6px;" align="center">
            <div style="font-family:${FONT};font-size:15px;line-height:1.75;color:${TEXT};
                        padding-bottom:20px;">
              오늘 고르지 못한 소식들은<br/>뉴스 터미널에 섹션별로 정리해 두었습니다.
            </div>
            ${button(terminalUrl, '전체 뉴스 보기')}
          </td>
        </tr>

        ${promoCards.length ? promoBlock(promoCards) : ''}

        ${assetsBlock()}

        <tr><td style="height:34px;line-height:34px;font-size:0;">&nbsp;</td></tr>

        ${footerBlock({ baseUrl })}
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
