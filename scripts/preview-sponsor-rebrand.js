// ─────────────────────────────────────────────────────────────────────────────
// 명명권(스폰서) 리브랜딩 미리보기 — 독립 실행 (DB/네트워크 불필요)
//
// 목적: "씬짜오베트남"(현재) vs "신한은행"(로고 교체) 이 이메일에서 어떻게 보이는지
//       한 페이지에서 나란히 비교한다.
//
// 카드 영역은 브라우저가 렌더하도록 HTML/CSS 로 실제 카드 레이아웃을 재현했다.
//   (로컬 PC node-canvas 는 한글 폰트가 깨지지만, 서버 발송 카드는 동일 코드로
//    한글이 정상 렌더된다. 로고 합성 위치/동작은 card-generator.js 에서 검증됨.)
//
// 생성물: .tmp/sponsor-demo/preview.html  (브라우저로 열기)
// 실행:   node scripts/preview-sponsor-rebrand.js
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), '.tmp', 'sponsor-demo');
fs.mkdirSync(OUT_DIR, { recursive: true });

const dateString = '2026년 06월 08일 (월)';

const NEWS_ITEMS = [
  {
    title: '베트남 최초 미쉐린 스타 한국 식당 내부 공개',
    summary: "'미쉐린 가이드'가 선정한 베트남 최초의 미쉐린 스타 한식당이 하노이에 등장해 글로벌 미식가들의 이목을 집중시키고 있다.",
    url: 'https://chaovietnam.co.kr/136623/',
  },
  {
    title: '환율 급변동… 원-동 송금 타이밍 주목',
    summary: '원화 대비 베트남 동 환율이 단기간 출렁이며 교민 송금·사업 결제에 영향을 주고 있다.',
    url: 'https://chaovietnam.co.kr/daily-news-terminal/',
  },
];

// 임시 신한은행 로고 (인라인 SVG — 브라우저가 시스템 폰트로 한글 렌더)
// ※ 실제로는 고객이 준 PNG 로고 파일을 관리 메뉴에서 업로드해 교체한다.
const SHINHAN_LOGO_SVG = `
<svg width="240" height="56" viewBox="0 0 240 56" xmlns="http://www.w3.org/2000/svg">
  <circle cx="26" cy="28" r="24" fill="#0046ff"/>
  <path d="M14 30 a12 12 0 0 0 24 0" fill="none" stroke="#fff" stroke-width="5"/>
  <text x="62" y="30" font-family="'Malgun Gothic',sans-serif" font-size="28" font-weight="700" fill="#0046ff">신한은행</text>
  <text x="63" y="48" font-family="'Malgun Gothic',sans-serif" font-size="11" font-weight="700" letter-spacing="2" fill="#5b6b8c">SHINHAN BANK</text>
</svg>`;

// 카드 이미지(1200x630)를 HTML/CSS 로 재현 — 헤더만 브랜드별로 다름
function cardMockup({ headerHtml, creditHtml }) {
  const credit = creditHtml
    ? `<div style="font-size:10px; color:#999; text-align:center; padding:3px 0; border-top:1px solid #eee;">${creditHtml}</div>`
    : '';
  return `
  <div style="width:100%; aspect-ratio:1200/630; background:#fff; border:1px solid #ddd; box-sizing:border-box; display:flex; flex-direction:column; font-family:'Malgun Gothic',sans-serif;">
    <div style="height:21%; display:flex; align-items:center; justify-content:center; overflow:hidden; border-bottom:3px solid #8b0000;">${headerHtml}</div>
    <div style="flex:1; display:flex; gap:2%; padding:3% 4%; min-height:0;">
      <div style="width:46%; background:linear-gradient(135deg,#3a3f4b,#11151c); border-radius:4px; color:rgba(255,255,255,.8); display:flex; align-items:center; justify-content:center; font-size:13px;">샘플 뉴스 사진</div>
      <div style="flex:1; display:flex; flex-direction:column;">
        <div style="color:#8b0000; font-weight:700; font-size:18px; margin-bottom:8px;">2026.06.08</div>
        <div style="font-size:14px; font-weight:700; color:#1a1a1a; line-height:1.4;">베트남 최초 미쉐린 스타<br>한국 식당 내부 공개</div>
        <div style="margin-top:auto; font-size:11px; color:#888;">날씨 31° · USD 25,400 · KRW 17.8</div>
      </div>
    </div>
    ${credit}
    <div style="height:8px; background:#1a3a8b;"></div>
  </div>`;
}

// 작은 "후원 SPONSORED BY" 라벨
const sponsorTag = `<span style="font-size:11px; color:#888; border:1px solid #ddd; border-radius:4px; padding:2px 8px; letter-spacing:1px; white-space:nowrap;">SPONSORED BY</span>`;

function buildEmailBody({ sponsor }) {
  // 발행인(책임소재)은 항상 씬짜오. 스폰서가 있으면 그 아래에 "후원"으로 표기.
  let masthead, bodyHeader, cardHeader, cardCredit = '';

  if (sponsor) {
    // 발행인 영문 마스트헤드 고정 + 후원 로고
    masthead = `<div style="font-size:13px; color:#666; margin-bottom:10px;">
      <strong style="color:#444;">XinChao Daily News</strong> · 24년 베트남 한인 미디어 | ${dateString}</div>`;
    bodyHeader = `<div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
      ${sponsorTag}${sponsor.logoHtml}</div>`;
    // 카드 헤더: 로고 + 그 아래 "오늘의 뉴스" (책임소재는 하단 크레딧 띠로)
    cardHeader = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; line-height:1;">
      <div style="transform:scale(0.62); margin:-4px 0;">${sponsor.logoHtml}</div>
      <div style="color:#8b0000; font-weight:700; font-size:14px;">오늘의 뉴스</div>
    </div>`;
    cardCredit = `제작 · XinChao Daily News &nbsp;|&nbsp; 후원 · ${sponsor.name}`;
  } else {
    masthead = `<div style="font-size:13px; color:#666; margin-bottom:12px;">씬짜오베트남 데일리뉴스 | ${dateString}</div>`;
    bodyHeader = `<div style="font-size:24px; color:#d1121d; font-weight:bold;">씬짜오베트남 오늘의 뉴스</div>`;
    cardHeader = `<div style="color:#8b0000; font-weight:700; font-size:26px;">씬짜오베트남 오늘의 뉴스</div>`;
  }

  const newsRows = NEWS_ITEMS.map((n) => `
    <div style="margin-bottom:16px;">
      <div style="font-size:15px; font-weight:bold; color:#1a1a1a; margin-bottom:3px;">📍 ${n.title}</div>
      <div style="font-size:13px; color:#555; line-height:1.5;">${n.summary}</div>
      <a href="${n.url}" style="font-size:12px; color:#2563eb;">자세한 내용은 링크를 클릭 ▸</a>
    </div>`).join('');

  return `
  <div style="font-family:'Malgun Gothic',sans-serif; color:#333; padding:20px; background:#fff;">
    ${masthead}
    ${bodyHeader}
    <div style="margin:16px 0;">${cardMockup({ headerHtml: cardHeader, creditHtml: cardCredit })}</div>
    ${newsRows}
    <div style="margin-top:18px; background:#fff8f0; border:1px solid #fed7aa; border-radius:8px; padding:12px 16px; font-size:13px; color:#7c2d12;">
      📱 <strong>매일 이메일 + 실시간 알림</strong>은 앱에서. 24년 베트남 한인 미디어, 이제 모바일로.
    </div>
  </div>`;
}

function inboxRow({ senderName, subject, snippet }) {
  return `
  <div style="display:flex; gap:12px; padding:12px 14px; border-bottom:1px solid #eee; align-items:flex-start;">
    <div style="width:36px; height:36px; border-radius:50%; background:#d9e2ff; color:#0046ff; font-weight:bold; display:flex; align-items:center; justify-content:center; font-size:14px;">${senderName.slice(0, 1)}</div>
    <div style="flex:1; min-width:0;">
      <div style="font-weight:bold; font-size:14px; color:#202124;">${senderName}</div>
      <div style="font-size:14px; color:#202124; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${subject}</div>
      <div style="font-size:13px; color:#5f6368; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${snippet}</div>
    </div>
  </div>`;
}

const before = buildEmailBody({ sponsor: null });
const after = buildEmailBody({ sponsor: { name: '신한은행', logoHtml: SHINHAN_LOGO_SVG } });

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>명명권 미리보기 — 씬짜오베트남 vs 신한은행</title>
<style>
  body{font-family:'Malgun Gothic',sans-serif; background:#f1f3f4; margin:0; padding:24px;}
  h1{font-size:20px; text-align:center; color:#202124;}
  .lead{text-align:center; color:#5f6368; font-size:13px; margin:-8px 0 20px;}
  .grid{display:grid; grid-template-columns:1fr 1fr; gap:24px; max-width:1280px; margin:0 auto;}
  .col{background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.12);}
  .tag{padding:10px 16px; font-weight:bold; color:#fff; font-size:15px;}
  .tag.before{background:#9aa0a6;}
  .tag.after{background:#0046ff;}
  .sub{padding:8px 16px; font-size:12px; color:#5f6368; background:#f8f9fa; border-top:1px solid #eee; border-bottom:1px solid #eee;}
</style></head><body>
<h1>📧 명명권 미리보기 — 이름/로고만 바꾸면 이렇게 보입니다</h1>
<div class="lead">왼쪽=현재 / 오른쪽=신한은행 명명권 판매 시. 보낸사람·발행인은 <b>XinChao Daily News</b>로 고정(책임소재 유지), 그 아래만 "후원 신한은행"으로 표기됩니다.</div>
<div class="grid">
  <div class="col">
    <div class="tag before">BEFORE · 현재 (씬짜오베트남)</div>
    <div class="sub">① 받은편지함 (보낸사람 · 제목)</div>
    ${inboxRow({ senderName: 'XinChao Daily News', subject: '[씬짜오베트남] 데일리뉴스 | ' + dateString, snippet: '씬짜오베트남 오늘의 뉴스 — 베트남 최초 미쉐린 스타 한국 식당…' })}
    <div class="sub">② 메일 본문</div>
    ${before}
  </div>
  <div class="col">
    <div class="tag after">AFTER · 명명권 판매 (신한은행)</div>
    <div class="sub">① 받은편지함 (보낸사람 · 제목)</div>
    ${inboxRow({ senderName: 'XinChao Daily News', subject: '[신한은행] 데일리뉴스 | ' + dateString, snippet: '신한은행 후원 — 베트남 최초 미쉐린 스타 한국 식당…' })}
    <div class="sub">② 메일 본문</div>
    ${after}
  </div>
</div>
<p style="text-align:center; color:#80868b; font-size:12px; margin-top:24px;">
  ※ 신한은행 로고는 시연용 임시 이미지입니다. 실제 로고 파일을 받으면 관리 메뉴에서 업로드·교체합니다.<br>
  ※ 카드 영역은 브라우저 렌더 미리보기입니다. 실제 발송 카드(PNG)는 서버에서 동일 레이아웃·동일 로고로 생성됩니다.
</p>
</body></html>`;

const htmlPath = path.join(OUT_DIR, 'preview.html');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✅ 완료. 브라우저로 여세요:\n   ' + htmlPath);
