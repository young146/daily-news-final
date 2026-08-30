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
// 3차 개편 (사장님 지시):
//   ⑩ '데일리뉴스 · 날짜' 를 진하고 크게 — 머리에서 유일한 글자이므로 여기가 약하면
//      머리 전체가 흐려 보인다.
//   ⑪ **카드 그림 안의 날짜를 뺐다** (lib/card-generator.js). 머리에 날짜가 크게
//      들어갔으므로 바로 아래 그림에 또 있으면 같은 말이 두 번이다.
//   ⑫ "오늘 고르지 못한 소식들은 …" → "섹션별로 정리된 오늘의 뉴스".
//      설명하려 들면 늙어 보인다. 이름만 대면 된다.
//   ⑬ 자산 안내 세 줄 → "씬짜오베트남이 제공하는 디지털 라인" 한 줄,
//      버튼은 "모든 것이 한곳에서".
//   ⑯ 광고 설명은 편집기 HTML 이다 — 글자로 바꾸면 태그가 그대로 찍힌다.
//      그렇다고 날것으로 넣으면 lab() 색·<h2>·&nbsp; 떡칠이 메일을 망친다.
//      → adHtml(): 허용 태그만 남기고 꾸밈은 벗긴 뒤 우리 서식을 다시 입힌다.
//   ⑮ 머리(로고 + 데일리뉴스·날짜)에 오렌지를 입혔다. 아래 칸은 그날의 사진으로
//      덮이므로, 머리가 브랜드 색을 맡지 않으면 메일 어디에도 우리 색이 안 남는다.
//   ⑭ 자산 안내를 **사진 위에 글자** 로 바꿨다 (사장님 지시).
//      처음엔 그림을 통짜로 얹었는데 너무 컸다. 잘라서 줄이면 폰·글자가 잘린다.
//      배경으로 깔면 칸 높이를 우리가 정하고 그림이 거기 맞춰 잘려 들어간다.
//      Outlook 이 background-image 를 무시하는 문제는 VML(v:rect + v:fill) 로 덮었다 —
//      메일에서 배경 그림을 쓸 때의 표준 수법이다. VML 마저 실패해도
//      bgcolor 가 남아 흰 글자가 읽힌다.
//
// 4차 개편 (사장님 지시):
//   ⑰ 머리 배치 — 로고는 왼쪽 위, '씬짜오 데일리 뉴스 + 날짜' 는 가운데 두 배 크기.
//   ⑱ 카드 그림의 '씬짜오베트남 오늘의 뉴스' 머리글을 없애고, 사진이 카드 전체를
//      덮게 한 뒤 그 위에 제목을 얹었다 (lib/card-generator.js).
//   ⑲ 아래 목록에서 **톱뉴스를 뺐다** — 바로 위 큰 사진이 이미 톱뉴스다.
//      같은 기사가 두 번 나오면 기계가 뱉은 것처럼 보인다.
//   ⑳ 목록을 '작은 사진 + 제목' 다섯 줄로 줄였다(요약 삭제).
//      이유는 취향이 아니다 — **광고를 한 화면이라도 빨리 만나게 하려는 것**이다.
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

// 앱 안내 그림 (chaovietnam.co.kr/app 의 그 배너)을 **배경으로** 쓴다.
//
// 왜 배경인가: 그림을 통짜로 넣으면 너무 크다(원본 1200x670). 그렇다고 잘라 줄이면
// 폰이나 글자가 잘린다. 배경으로 깔면 **칸 높이를 우리가 정하고** 그림은 그 높이에
// 맞춰 잘려 들어간다 — 크기 문제와 '사진 위에 글자' 를 한 번에 푼다. (사장님 지시)
//
// 그래서 미리 손봐 둔 그림을 쓴다 (public/app-banner-bg.jpg):
//   · 위쪽 브랜드 글자 영역을 잘라냈다 — 그 위에 우리 문구를 얹으므로 글자가 겹치면 안 된다.
//   · 밝기를 52% 로 미리 어둡게 구웠다. 메일에서는 배경 위에 반투명 막을 CSS 로 덮는
//     방법이 클라이언트마다 깨져서, 아예 그림에 구워 넣는 것이 확실하다.
const APP_BG_URL = 'https://daily-news-final.vercel.app/app-banner-bg.jpg';
const APP_BG_FALLBACK = '#14222E';   // 그림이 안 뜰 때의 바탕색 (야경에서 뽑은 색)
const APP_BG_H = 210;                // 칸 높이(px)

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

/** 광고 설명은 **편집기에서 HTML 로 저장된다** — 글자로 바꾸면 태그가 그대로 보인다.
 *  (2026-08-27 사장님이 발견: 메일에 <h2> <span style=...> 가 글자로 찍혀 나왔다)
 *
 *  그렇다고 날것 그대로 넣어도 안 된다. 편집기가 남기는 것들이 메일에서 말썽이다:
 *    · style="color: lab(35.5 -1.7 -15.4); background-color: rgb(255,255,255)"
 *      → lab() 은 메일 클라이언트가 모르고, 흰 배경색은 카드 바탕과 싸운다.
 *    · <h2> → 작은 카드 안에서 제목만큼 커져 균형이 깨진다.
 *    · &nbsp; 떡칠 → 줄바꿈이 이상한 자리에서 일어난다.
 *
 *  그래서 **허용한 태그만 남기고 꾸밈은 전부 벗긴 뒤 우리 서식을 다시 입힌다.**
 */
function adHtml(raw) {
  if (!raw) return '';
  let h = String(raw);

  h = h.replace(/<!--[\s\S]*?-->/g, '');
  h = h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');

  // 인라인 꾸밈은 전부 제거 (href 는 남긴다)
  h = h.replace(/\s(?:style|class|id|dir|lang|align|width|height|bgcolor)\s*=\s*"[^"]*"/gi, '');
  h = h.replace(/\s(?:style|class|id|dir|lang|align|width|height|bgcolor)\s*=\s*'[^']*'/gi, '');

  // 제목 태그 → 굵은 한 줄
  h = h.replace(/<h[1-6]\b[^>]*>/gi, '<p><strong>').replace(/<\/h[1-6]>/gi, '</strong></p>');

  // 허용 태그만 남기고 나머지 껍데기는 벗긴다 (안의 글자는 살린다)
  const ALLOW = /^(p|br|strong|b|em|i|ul|ol|li|a)$/i;
  h = h.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (m, tag) => (ALLOW.test(tag) ? m : ''));

  h = h.replace(/(&nbsp;|\u00a0)+/g, ' ');

  // 빈 껍데기 정리. 편집기는 <h2></h2> 같은 빈 줄을 자주 남기는데, 위에서 그것이
  // <p><strong></strong></p> 가 된다 → 안쪽부터 벗겨내며 사라질 때까지 반복한다.
  for (let i = 0; i < 5; i++) {
    const before = h;
    h = h.replace(/<(strong|b|em|i)>\s*<\/\1>/gi, '');
    h = h.replace(/<p>\s*(?:<br\s*\/?>\s*)*<\/p>/gi, '');
    if (h === before) break;
  }
  // <h2><strong> 이 겹쳐 <strong><strong> 이 되는 것을 한 겹으로
  h = h.replace(/<strong>\s*<strong>/gi, '<strong>').replace(/<\/strong>\s*<\/strong>/gi, '</strong>');

  // 벗겨낸 자리에 우리 서식을 다시 입힌다 (메일은 상속이 잘 안 되므로 태그마다 직접)
  const pStyle = `margin:0 0 10px 0;font-family:${FONT};font-size:14.5px;line-height:1.75;color:${TEXT};`;
  h = h.replace(/<p\b[^>]*>/gi, `<p style="${pStyle}">`);
  h = h.replace(/<(ul|ol)\b[^>]*>/gi, (m, t) => `<${t} style="margin:0 0 10px 0;padding-left:20px;">`);
  h = h.replace(/<li\b[^>]*>/gi,
    `<li style="font-family:${FONT};font-size:14.5px;line-height:1.75;color:${TEXT};margin:0 0 5px 0;">`);
  h = h.replace(/<a\b([^>]*?)>/gi, (m, attrs) =>
    `<a${attrs} target="_blank" style="color:${ORANGE_DEEP};text-decoration:underline;">`);

  return h.trim();
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
      <div style="padding-top:12px;">
        <span style="font-family:${FONT};font-size:10px;letter-spacing:.16em;
                     color:rgba(255,255,255,.72);vertical-align:middle;">SPONSORED BY</span>
        &nbsp;
        ${sponsor.logoUrl
          ? `<img src="${sponsor.logoUrl}" alt="${esc(sponsor.name)}" height="22"
                  style="height:22px;vertical-align:middle;border:0;" />`
          : `<span style="font-family:${FONT};font-size:15px;font-weight:700;
                          color:#FFFFFF;vertical-align:middle;">${esc(sponsor.name)}</span>`}
      </div>`
    : '';

  // 머리 배치 (2026-08-27 사장님 지시):
  //   · 로고는 **왼쪽 위**
  //   · '씬짜오 데일리 뉴스 + 날짜' 는 **가운데**, 글씨는 두 배
  //
  // 로고와 큰 글씨를 한 줄에 나란히 놓지 않고 **두 줄로 나눈** 이유:
  // 한 줄에 [로고][가운데 글씨] 를 넣으면 로고 폭만큼 글씨가 오른쪽으로 밀려
  // '가운데' 가 가운데가 아니게 된다. 줄을 나누면 로고는 진짜 왼쪽 끝, 글씨는
  // 진짜 한가운데에 온다. (메일은 flex 가 없어 이런 정렬을 표로 풀어야 한다)
  //
  // 날짜는 제목보다 한 급 작게 둔다 — 같은 크기로 붙이면 휴대폰에서 두 줄로
  // 접히면서 어느 쪽이 제목인지 알아볼 수 없게 된다.
  return `
  <tr>
    <td class="pad" bgcolor="${ORANGE}" style="padding:20px 40px 22px;background:${ORANGE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="left">
            <img src="${LOGO_URL}" alt="${esc(publisherNameEn || 'Xin Chao Vietnam')}"
                 width="150" style="width:150px;max-width:45%;height:auto;display:block;border:0;" />
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:14px;">
            <div class="h1" style="font-family:${FONT};font-size:31px;line-height:1.3;
                        font-weight:700;letter-spacing:-.02em;color:#FFFFFF;">
              씬짜오 데일리 뉴스
            </div>
            <div class="hdate" style="font-family:${FONT};font-size:19px;font-weight:600;
                        color:rgba(255,255,255,.9);padding-top:7px;">
              ${esc(dateString)}
            </div>
            ${sponsorLine}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ── 추천 뉴스 한 줄 — 작은 사진 + 제목만 ────────────────────────────
//
// 왜 요약을 뺐나 (2026-08-27 사장님 지시):
//   "광고 고객을 조금이라도 더 빨리 노출시키기 위함이다."
//   요약까지 넣으면 다섯 꼭지에 화면 두세 판이 잡아먹혀, 그 아래 광고까지
//   내려오는 사람이 확 줄어든다. 제목만으로도 누를 사람은 누른다.
//
// 톱뉴스는 여기 넣지 않는다 — 바로 위 큰 사진이 이미 톱뉴스다.
// 같은 기사가 두 번 나오면 "고르지도 않고 기계가 뱉었구나" 로 읽힌다.
function newsRow(item, isLast) {
  const thumb = item.imageUrl
    ? `<img src="${item.imageUrl}" alt="" width="120"
            style="width:120px;height:80px;object-fit:cover;display:block;border:0;
                   border-radius:8px;" />`
    // 사진이 없는 기사도 있다 → 자리를 비우지 말고 옅은 색 네모로 채운다.
    //   (칸이 비면 옆 제목이 왼쪽으로 밀려 줄마다 시작점이 달라진다)
    : `<div style="width:120px;height:80px;background:${ORANGE_SOFT};border-radius:8px;
                   line-height:80px;text-align:center;font-size:20px;">📰</div>`;

  return `
  <tr>
    <td class="pad" style="padding:0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="120" valign="top" style="width:120px;padding:16px 0;">
            <a href="${item.url}" target="_blank" style="display:block;">${thumb}</a>
          </td>
          <td valign="middle" style="padding:16px 0 16px 16px;">
            <a href="${item.url}" target="_blank" class="title"
               style="font-family:${FONT};font-size:17.5px;line-height:1.5;font-weight:700;
                      color:${HEAD};text-decoration:none;letter-spacing:-.01em;">
              ${esc(item.title || '')}
            </a>
          </td>
        </tr>
      </table>
      ${isLast ? '' : hairline}
    </td>
  </tr>`;
}

// ── 오늘 한국에선 — 옅은 오렌지 상자 ──────────────────────────────────
function koreaBlock(koreaNews) {
  // 사진을 넣되 **추천 뉴스보다 작게**(84x60 vs 120x80) 둔다.
  // 같은 크기로 하면 두 칸이 똑같아 보여 "한국 소식" 이라는 구분이 사라지고,
  // 메일도 그만큼 길어져 광고가 뒤로 밀린다.
  const items = koreaNews.map((n, i) => `
    <tr>
      <td valign="middle" style="padding:${i === 0 ? '0' : '11px'} 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="84" valign="middle" style="width:84px;">
              <a href="${n.url}" target="_blank" style="display:block;">
                ${n.imageUrl
                  ? `<img src="${n.imageUrl}" alt="" width="84"
                          style="width:84px;height:60px;object-fit:cover;display:block;
                                 border:0;border-radius:6px;" />`
                  // ⚠️ 국기 이모지(🇰🇷)를 쓰지 않는다 — 윈도우에서 글자 두 개("KR")로
                  //    깨져 보인다(실측). 사진이 없을 때는 조용한 네모로만 자리를 지킨다.
                  : `<div style="width:84px;height:60px;background:#FFFFFF;border-radius:6px;
                                 line-height:60px;text-align:center;font-size:15px;
                                 color:${ORANGE};">&#9679;</div>`}
              </a>
            </td>
            <td valign="middle" style="padding-left:12px;">
              <a href="${n.url}" target="_blank"
                 style="font-family:${FONT};font-size:15px;line-height:1.5;font-weight:600;
                        color:${HEAD};text-decoration:none;">
                ${esc(n.title)} <span style="color:${ORANGE};">&rarr;</span>
              </a>
            </td>
          </tr>
        </table>
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

// ── 베트남 살이 실전노트 — 블로그 새 글 코너 ──────────────────────────
// 블로그 유통 자동화 트랙 (2026-08-30). 새 글이 있는 날만 나온다 —
// 데이터가 없으면 renderDailyNewsEmail 이 블록째 생략한다 (다른 섹션과 동일).
// 모양은 koreaBlock 을 따르되 바탕을 흰 카드로 두어 "뉴스가 아니라 읽을거리"로 구분.
function siljeonnoteBlock(posts) {
  const items = posts.map((p, i) => `
    <tr>
      <td valign="top" style="padding:${i === 0 ? '0' : '14px'} 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            ${p.imageUrl ? `
            <td width="84" valign="top" style="width:84px;">
              <a href="${p.url}" target="_blank" style="display:block;">
                <img src="${p.imageUrl}" alt="" width="84"
                     style="width:84px;height:60px;object-fit:cover;display:block;
                            border:0;border-radius:6px;" />
              </a>
            </td>
            <td valign="top" style="padding-left:12px;">` : `
            <td valign="top">`}
              <a href="${p.url}" target="_blank"
                 style="font-family:${FONT};font-size:15px;line-height:1.5;font-weight:600;
                        color:${HEAD};text-decoration:none;">
                ${esc(p.title)}
              </a>
              ${p.summary ? `
              <div style="font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTE};
                          padding-top:4px;">
                ${esc(p.summary)}&hellip;
                <a href="${p.url}" target="_blank"
                   style="color:${ORANGE_DEEP};text-decoration:none;font-weight:700;">이어 읽기 &rarr;</a>
              </div>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  return row(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${PAPER};border:1px solid ${LINE};border-radius:16px;">
      <tr>
        <td style="padding:24px 28px 26px;">
          <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.2em;
                      color:${ORANGE_DEEP};padding-bottom:4px;">
            베트남 살이 실전노트
          </div>
          <div style="font-family:${FONT};font-size:12.5px;color:${MUTE};padding-bottom:16px;">
            베트남에 오래 산 사람이 돈&middot;서류&middot;절차를 직접 확인하고 씁니다
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
          <div style="padding-top:10px;">${adHtml(c.description)}</div>` : ''}
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
  const href = 'https://vnkorlife.com/m';
  const innerW = MAXW - 80;   // 좌우 여백(40px씩)을 뺀 실제 칸 너비
  // 사진 위 내용 — Outlook 조건부 주석 안팎에서 같은 것을 쓰므로 한 번만 만든다
  const overlay = `
    <div style="font-family:${FONT};font-size:19px;font-weight:700;color:#FFFFFF;
                line-height:1.5;text-shadow:0 1px 6px rgba(0,0,0,.55);">
      씬짜오베트남이 제공하는 디지털 라인
    </div>
    <div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
    ${button(href, '모든 것이 한곳에서')}`;

  return row(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-radius:16px;overflow:hidden;">
      <tr>
        <td background="${APP_BG_URL}" bgcolor="${APP_BG_FALLBACK}" valign="middle"
            height="${APP_BG_H}" align="center"
            style="height:${APP_BG_H}px;background-color:${APP_BG_FALLBACK};
                   background-image:url('${APP_BG_URL}');background-position:center center;
                   background-repeat:no-repeat;background-size:cover;border-radius:16px;">
          <!--[if gte mso 9]>
          <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false"
                  style="width:${innerW}px;height:${APP_BG_H}px;">
            <v:fill type="frame" src="${APP_BG_URL}" color="${APP_BG_FALLBACK}" />
            <v:textbox inset="0,0,0,0">
          <![endif]-->
          <div style="padding:26px 24px;">${overlay}</div>
          <!--[if gte mso 9]>
            </v:textbox>
          </v:rect>
          <![endif]-->
        </td>
      </tr>
    </table>`, '28px 40px 0');
}

// ── 「주변에 전달해 주세요」 ──────────────────────────────────────────
/**
 * 왜 이 자리에 이런 부탁을 두나:
 *   이 메일을 받는 사람은 **이미 전원이 구독자**다. 여기에 「구독하세요」 를 놓으면
 *   신규는 한 명도 안 는다. 늘어나는 길은 하나뿐이다 — **받은 사람이 남에게 전달하는 것.**
 *
 * 그래서 권유가 아니라 **부탁**의 말투로 쓴다. 그리고 신청 주소를 **글자로도** 적는다.
 *   메일이 전달되면 버튼이 깨지거나 링크가 잘리는 일이 흔한데, 주소가 눈에 보이면
 *   전달받은 사람이 손으로 쳐서라도 찾아올 수 있다.
 *
 * 크게 만들지 않는다. 이건 광고가 아니라 부탁이고, 부탁은 작아야 부탁으로 읽힌다.
 */
function forwardBlock() {
  const href =
    'https://vnkorlife.com/newsletter?utm_source=email&utm_medium=newsletter&utm_content=forward';
  return row(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:${ORANGE_SOFT};border:1px solid ${ORANGE_LINE};border-radius:14px;">
      <tr>
        <td align="center" style="padding:20px 24px;">
          <div style="font-family:${FONT};font-size:15px;font-weight:700;color:${HEAD};
                      line-height:1.6;">
            이 편지가 쓸 만하셨다면, 베트남에 계신 분께 전달해 주세요
          </div>
          <div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>
          <div style="font-family:${FONT};font-size:13.5px;color:#7A6A5C;line-height:1.7;">
            전달받으신 분은 아래에서 직접 신청하실 수 있습니다<br>
            <a href="${href}" target="_blank"
               style="color:${ORANGE_DEEP};font-weight:700;text-decoration:underline;">
              vnkorlife.com/newsletter
            </a>
          </div>
        </td>
      </tr>
    </table>`, '26px 40px 0');
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
    newsItems = [], koreaNews = [], blogPosts = [], promoCards = [],
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
    .title{font-size:16px!important;}
    .h1{font-size:24px!important;}
    .hdate{font-size:16px!important;}
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

        ${newsItems.length ? `
        <tr>
          <td class="pad" style="padding:26px 40px 0;">
            <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.2em;
                        color:${ORANGE_DEEP};">오늘의 추천 뉴스</div>
          </td>
        </tr>` : ''}

        ${newsItems.map((it, i) => newsRow(it, i === newsItems.length - 1)).join('')}

        ${newsItems.length ? row(hairline, '0 40px') : ''}

        ${koreaNews.length ? koreaBlock(koreaNews) : ''}

        ${blogPosts.length ? siljeonnoteBlock(blogPosts) : ''}

        <tr>
          <td class="pad" style="padding:30px 40px 6px;" align="center">
            <div style="font-family:${FONT};font-size:16px;font-weight:600;line-height:1.6;
                        color:${HEAD};padding-bottom:20px;">
              섹션별로 정리된 오늘의 뉴스
            </div>
            ${button(terminalUrl, '전체 뉴스 보기')}
          </td>
        </tr>

        ${promoCards.length ? promoBlock(promoCards) : ''}

        ${assetsBlock()}

        ${forwardBlock()}

        <tr><td style="height:34px;line-height:34px;font-size:0;">&nbsp;</td></tr>

        ${footerBlock({ baseUrl })}
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
