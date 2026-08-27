// 데일리 뉴스레터 이메일 템플릿 (2026-08-27 전면 개편)
//
// 왜 다시 짰나 — 사장님: "너무 19세기 스타일이라 내가 늙은이라는 걸 알려주는 것 같다."
// 실제로 낡아 보이게 만든 것은 취향이 아니라 아래 다섯 가지였다:
//   ① 본문에 날 URL 을 그대로 인쇄 ("자세한 내용은 링크를 클릭: https://...")
//      → 제목 자체가 링크여야 한다. 주소를 눈에 보이게 적는 건 2000년대 관습이다.
//   ② 📍 이모지 불릿
//   ③ 좁은 여백 + 14px 본문 (요즘 메일 본문 기준은 16px)
//   ④ 흰 바탕에 요소가 그냥 얹혀 있음 → 배경 위에 카드가 뜬 구조가 지금 표준
//   ⑤ 미리보기 텍스트(preheader) 없음 → 받은편지함에서 제목 옆이 비어 보인다
//
// ⚠️ 이메일 HTML 은 웹과 규칙이 다르다. 아래는 취향이 아니라 제약이다:
//   · 레이아웃은 <table> 로. Outlook 데스크탑은 Word 엔진이라 flex/grid 를 못 쓴다.
//   · 모든 스타일은 인라인. <style> 은 Gmail 등에서 일부만 살아남는다
//     (그래서 미디어쿼리는 '있으면 좋은 것'으로만 쓰고, 인라인만으로도 읽히게 짠다).
//   · 웹폰트 금지 — 대부분 클라이언트가 막는다. 시스템 폰트 스택을 쓴다.
//   · 이미지는 꺼진 채로 열리는 경우가 흔하다 → alt 필수, 이미지 없이도 뜻이 통해야 한다.
//   · 버튼은 <button> 이 아니라 테이블+배경색("bulletproof button").
//
// 색은 씬짜오 매거진 팔레트로 맞췄다(vnkorlife /xinchao · /download 와 동일).
// 브랜드가 매체마다 다른 색을 쓰면 한 회사로 안 보인다.

const INK = '#12231C';        // 딥그린 — 헤더·푸터
const EMBER = '#C45614';      // 씬짜오 오렌지 — 강조·버튼
const CREAM = '#F4F1EC';      // 봉투 바탕
const PAPER = '#FFFFFF';      // 카드
const TEXT = '#3F3F3F';       // 본문
const MUTE = '#8A8578';       // 보조
const LINE = '#E8E3DA';       // 해어라인

const FONT =
  "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic'," +
  "'맑은 고딕','Noto Sans KR',Roboto,'Helvetica Neue',Arial,sans-serif";

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
    // 미리보기 칸을 다 채워 뒤 내용이 새어나오지 않게 하는 관용구
    '&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;'.repeat(15) +
    '</div>'
  );
}

/** 가운데 정렬된 한 칸짜리 행 — 카드 안의 블록을 담는 그릇 */
function row(inner, pad = '0 32px') {
  return `<tr><td style="padding:${pad};">${inner}</td></tr>`;
}

/** Outlook 에서도 눌리는 버튼 (배경색이 들어간 테이블) */
function button(href, label, { bg = EMBER, fg = '#FFFFFF' } = {}) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${bg}" style="border-radius:10px;">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;
                  font-weight:700;color:${fg};text-decoration:none;border-radius:10px;">
          ${esc(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

/** 얇은 구분선 */
const hairline = `<div style="height:1px;line-height:1px;font-size:0;background:${LINE};">&nbsp;</div>`;

// ── 머리 — 우리가 누구인지 한 줄, 그리고 날짜 ─────────────────────────
function headerBlock({ dateString, sponsor, publisherName, publisherNameEn, isSponsored }) {
  const sponsorMark = isSponsored
    ? (sponsor.logoUrl
        ? `<img src="${sponsor.logoUrl}" alt="${esc(sponsor.name)}" height="28"
                style="height:28px;display:block;border:0;" />`
        : `<span style="font-size:18px;color:${EMBER};font-weight:700;">${esc(sponsor.name)}</span>`)
    : '';

  return `
  <tr>
    <td style="background:${INK};padding:30px 32px 26px;" align="center">
      <div style="font-family:${FONT};font-size:11px;letter-spacing:.22em;
                  color:rgba(245,222,179,.55);font-weight:700;text-transform:uppercase;">
        ${esc(publisherNameEn || 'XIN CHAO VIETNAM')}
      </div>
      <div style="font-family:${FONT};font-size:23px;line-height:1.35;color:#F5DEB3;
                  font-weight:700;padding-top:10px;letter-spacing:-.01em;">
        오늘의 베트남
      </div>
      <div style="width:34px;height:2px;line-height:2px;font-size:0;background:${EMBER};
                  margin:14px auto 12px;">&nbsp;</div>
      <div style="font-family:${FONT};font-size:13px;color:rgba(245,222,179,.62);">
        ${esc(dateString)}
      </div>
      ${isSponsored ? `
      <div style="padding-top:18px;">
        <div style="font-family:${FONT};font-size:10px;letter-spacing:.18em;
                    color:rgba(245,222,179,.42);padding-bottom:8px;">SPONSORED BY</div>
        ${sponsorMark}
      </div>` : ''}
    </td>
  </tr>`;
}

// ── 기사 한 꼭지 ──────────────────────────────────────────────────────
// 번호를 붙인다 — "오늘 고른 다섯 꼭지" 라는 편집된 느낌이 생긴다.
// 제목이 곧 링크다. 주소를 본문에 인쇄하지 않는다.
function newsItem(item, index, isLast) {
  const title = item.translatedTitle || item.title || '';
  const summary = (item.translatedSummary || item.summary || '')
    .split('\n').map(esc).join('<br/>');
  return `
  <tr>
    <td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding:${index === 0 ? '28px' : '24px'} 0 ${isLast ? '28px' : '24px'};">
            <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.16em;
                        color:${EMBER};padding-bottom:9px;">
              ${String(index + 1).padStart(2, '0')}
            </div>
            <a href="${item.url}" target="_blank"
               style="font-family:${FONT};font-size:19px;line-height:1.45;font-weight:700;
                      color:${INK};text-decoration:none;display:block;letter-spacing:-.01em;">
              ${esc(title)}
            </a>
            ${summary ? `
            <div style="font-family:${FONT};font-size:15px;line-height:1.8;color:${TEXT};
                        padding-top:11px;">${summary}</div>` : ''}
            <div style="padding-top:13px;">
              <a href="${item.url}" target="_blank"
                 style="font-family:${FONT};font-size:13px;font-weight:700;color:${EMBER};
                        text-decoration:none;">기사 전문 보기 &rarr;</a>
            </div>
          </td>
        </tr>
      </table>
      ${isLast ? '' : hairline}
    </td>
  </tr>`;
}

// ── 오늘 한국에선 ─────────────────────────────────────────────────────
function koreaBlock(koreaNews) {
  const items = koreaNews.map((n, i) => `
    <tr>
      <td style="padding:${i === 0 ? '0' : '11px'} 0 0;">
        <a href="${n.url}" target="_blank"
           style="font-family:${FONT};font-size:14.5px;line-height:1.55;font-weight:600;
                  color:#F5DEB3;text-decoration:none;">
          ${esc(n.title)} <span style="color:rgba(245,222,179,.45);">&rarr;</span>
        </a>
      </td>
    </tr>`).join('');

  return row(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${INK};border-radius:14px;">
      <tr>
        <td style="padding:24px 26px 26px;">
          <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.2em;
                      color:rgba(245,222,179,.5);padding-bottom:16px;">
            오늘 한국에선
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${items}
          </table>
        </td>
      </tr>
    </table>`, '10px 32px 0');
}

// ── 홍보 카드 ─────────────────────────────────────────────────────────
function promoBlock(promoCards) {
  const cards = promoCards.map((c) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${PAPER};border:1px solid ${LINE};border-radius:14px;
                  margin-bottom:16px;">
      ${c.imageUrl ? `
      <tr>
        <td>
          <a href="${c.linkUrl}" target="_blank" style="display:block;">
            <img src="${c.imageUrl}" alt="${esc(c.title)}" width="536"
                 style="width:100%;max-width:536px;height:auto;display:block;border:0;
                        border-radius:14px 14px 0 0;" />
          </a>
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:20px 22px 22px;">
          <div style="font-family:${FONT};font-size:16.5px;font-weight:700;color:${INK};
                      line-height:1.45;">${esc(c.title)}</div>
          ${c.description ? `
          <div style="font-family:${FONT};font-size:14px;line-height:1.75;color:${TEXT};
                      padding-top:9px;white-space:pre-wrap;">${esc(c.description)}</div>` : ''}
          ${c.linkUrl ? `
          <div style="padding-top:16px;">
            <a href="${c.linkUrl}" target="_blank"
               style="font-family:${FONT};font-size:13px;font-weight:700;color:${EMBER};
                      text-decoration:none;">자세히 보기 &rarr;</a>
          </div>` : ''}
        </td>
      </tr>
    </table>`).join('');

  return row(`
    <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.2em;
                color:${EMBER};padding:6px 0 14px;">함께 홍보해요</div>
    ${cards}`, '26px 32px 0');
}

// ── 씬짜오 자산 안내 — 밖으로 나가는 유일한 창구 ──────────────────────
// 주소는 vnkorlife.com/m 하나만 쓴다(서버가 "이메일에서 왔다" 꼬리표를 붙여 넘긴다).
// 앱·카톡방·매거진 주소를 여기 늘어놓지 않는 이유: 넷을 한꺼번에 보면 아무 데도 안 간다.
function assetsBlock() {
  return row(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#FBF7F0;border:1px solid ${LINE};border-radius:14px;">
      <tr>
        <td style="padding:24px 26px;" align="center">
          <div style="font-family:${FONT};font-size:15px;font-weight:700;color:${INK};
                      line-height:1.6;">
            씬짜오 앱 · 매거진 · 옐로페이지
          </div>
          <div style="font-family:${FONT};font-size:13.5px;line-height:1.75;color:${TEXT};
                      padding:8px 0 18px;">
            뉴스 · 환율 · 구인 · 부동산을 한 곳에서.<br/>
            베트남 생활에 필요한 것들을 모아 두었습니다.
          </div>
          ${button('https://vnkorlife.com/m', '씬짜오 서비스 둘러보기')}
        </td>
      </tr>
    </table>`, '26px 32px 0');
}

// ── 푸터 ──────────────────────────────────────────────────────────────
function footerBlock({ baseUrl }) {
  return `
  <tr>
    <td style="background:${INK};padding:28px 32px 26px;" align="center">
      <div style="font-family:${FONT};font-size:12.5px;font-weight:700;color:rgba(245,222,179,.85);">
        HANHOA CO., LTD
      </div>
      <div style="font-family:${FONT};font-size:11.5px;line-height:1.8;
                  color:rgba(245,222,179,.45);padding-top:8px;">
        9th Floor, EBM Building, 685 Dien Bien Phu, Binh Thanh, HCMC<br/>
        T. 028-3511-1075 &nbsp;·&nbsp; info@chaovietnam.co.kr
      </div>
      <div style="height:1px;line-height:1px;font-size:0;background:rgba(245,222,179,.14);
                  margin:20px 0 16px;">&nbsp;</div>
      <div style="font-family:${FONT};font-size:11px;line-height:1.7;
                  color:rgba(245,222,179,.35);">
        이 메일은 씬짜오베트남 뉴스레터 구독자에게 보내드립니다.<br/>
        <a href="${baseUrl}/unsubscribe" target="_blank"
           style="color:rgba(245,222,179,.55);text-decoration:underline;">수신 거부</a>
      </div>
    </td>
  </tr>`;
}

/**
 * 데일리 뉴스레터 전체 HTML.
 *
 * @param {object} o
 * @param {string} o.dateString      2026년 08월 27일 (목)
 * @param {string} o.cardImageUrl    카드뉴스 이미지 (없으면 생략)
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
  a{color:${EMBER};}
  @media only screen and (max-width:620px){
    .wrap{width:100%!important;}
    .pad{padding-left:20px!important;padding-right:20px!important;}
    .h1{font-size:21px!important;}
    .title{font-size:17.5px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
${preheader(topHeadline)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${CREAM};">
  <tr>
    <td align="center" style="padding:26px 12px 34px;">

      <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:600px;background:${PAPER};border-radius:18px;overflow:hidden;">

        ${headerBlock({
          dateString,
          sponsor: brand.sponsor || {},
          publisherName: brand.publisherName,
          publisherNameEn: brand.publisherNameEn,
          isSponsored: !!brand.isSponsored,
        })}

        ${cardImageUrl ? `
        <tr>
          <td>
            <a href="${terminalUrl}" target="_blank" style="display:block;">
              <img src="${cardImageUrl}" alt="오늘의 뉴스 카드" width="600"
                   style="width:100%;max-width:600px;height:auto;display:block;border:0;" />
            </a>
          </td>
        </tr>` : ''}

        ${newsItems.map((it, i) => newsItem(it, i, i === newsItems.length - 1)).join('')}

        ${newsItems.length ? row(hairline, '0 32px') : ''}

        ${koreaNews.length ? koreaBlock(koreaNews) : ''}

        <tr>
          <td class="pad" style="padding:28px 32px 4px;" align="center">
            <div style="font-family:${FONT};font-size:14.5px;line-height:1.75;color:${TEXT};
                        padding-bottom:18px;">
              오늘 고르지 못한 소식들은<br/>뉴스 터미널에 섹션별로 정리해 두었습니다.
            </div>
            ${button(terminalUrl, '전체 뉴스 보기')}
          </td>
        </tr>

        ${promoCards.length ? promoBlock(promoCards) : ''}

        ${assetsBlock()}

        <tr><td style="height:30px;line-height:30px;font-size:0;">&nbsp;</td></tr>

        ${footerBlock({ baseUrl })}
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
