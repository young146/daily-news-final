// ════════════════════════════════════════════════════════════════
// 구글 색인 상태 확인 (URL 검사 API)
// ────────────────────────────────────────────────────────────────
// 왜: 새 페이지를 올리고 "색인 생성 요청"을 누른 뒤, 실제로 색인이 됐는지
//     확인하려면 서치콘솔 화면을 매번 열어야 했다. API 로 바로 볼 수 있다.
//     ⚠️ 웹 화면보다 **API 가 더 최신**인 경우가 있다 (2026-09-02 실측:
//        화면은 "아직 알려지지 않은 URL", API 는 이미 "크롤링됨"이었다).
//
// 실행:
//   node scripts/gsc-inspect.js https://chaovietnam.co.kr/exchange-rate/
//   node scripts/gsc-inspect.js /exchange-rate/            (도메인 생략 가능)
//   node scripts/gsc-inspect.js url1 url2 url3             (여러 개 한 번에)
//
// 인증: search-console-report.js 와 동일 (FIREBASE_SERVICE_ACCOUNT_JSON).
//       스코프 webmasters.readonly 로 충분하다.
//
// 📌 색인 "요청"은 API 로 못 한다 — 구글이 안 열어뒀다(Indexing API 는 채용공고·
//    방송일정 전용). 요청은 사람이 서치콘솔 화면에서 눌러야 한다. 확인만 자동화한다.
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const { GoogleAuth } = require('google-auth-library');

const SITE = process.env.SEARCH_CONSOLE_SITE || 'sc-domain:chaovietnam.co.kr';
const ORIGIN = (process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr').replace(/\/$/, '');

const args = process.argv.slice(2);
if (!args.length) {
  console.error('사용법: node scripts/gsc-inspect.js <URL 또는 /경로/> [...]');
  process.exit(1);
}

// 색인 상태를 사람 말로 옮긴다 — 영어 코드만 보면 뭘 해야 할지 모른다
const VERDICT = {
  PASS: '✅ 색인됨 — 검색에 나옵니다',
  PARTIAL: '🟡 일부 문제 있음',
  FAIL: '❌ 색인 불가 — 아래 사유 확인',
  NEUTRAL: '⏳ 아직 색인 전 (중립)',
  VERDICT_UNSPECIFIED: '(판정 없음)',
};

const ADVICE = {
  '크롤링됨 - 현재 색인이 생성되지 않음':
    '구글이 와서 읽고 갔지만 아직 색인에 넣지 않았습니다. 새 페이지에서 흔한 중간 상태이고\n' +
    '     보통 며칠 안에 풀립니다. 오래 머물면 내용이 얇거나 비슷한 페이지가 있다는 신호입니다.',
  '검색됨 - 현재 색인이 생성되지 않음':
    '구글이 주소는 알지만 아직 읽으러 오지 않았습니다. 기다리거나 내부 링크를 늘리세요.',
  'URL이 Google에 알려지지 않음':
    '구글이 주소 자체를 모릅니다. 사이트맵 등록 + 내부 링크 + 색인 생성 요청이 필요합니다.',
};

async function token() {
  const opts = { scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] };
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    opts.credentials = { client_email: sa.client_email, private_key: sa.private_key };
  }
  const c = await new GoogleAuth(opts).getClient();
  return (await c.getAccessToken()).token;
}

(async () => {
  const t = await token();
  for (const raw0 of args) {
    // ⚠️ Git Bash(MSYS)는 "/exchange-rate/" 같은 인자를 윈도우 경로로 바꿔버린다.
    //    → "C:/Program Files/Git/exchange-rate/" 가 되어 엉뚱한 URL 을 조회하게 된다.
    //    실제로 한 번 당했다(2026-09-02). 그 흔적을 잘라내 되살린다.
    const raw = raw0.replace(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/]/i, '/');
    if (raw !== raw0) console.log(`   (Git Bash 경로 변환 보정: ${raw0} → ${raw})`);
    const url = raw.startsWith('http') ? raw : ORIGIN + (raw.startsWith('/') ? raw : '/' + raw);
    const r = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE, languageCode: 'ko' }),
    });
    console.log(`\n■ ${url}`);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      console.log(`   조회 실패 HTTP ${r.status} — ${(e.error && e.error.message || '').slice(0, 160)}`);
      continue;
    }
    const i = (await r.json()).inspectionResult || {};
    const ix = i.indexStatusResult || {};

    console.log(`   판정      : ${VERDICT[ix.verdict] || ix.verdict || '(없음)'}`);
    console.log(`   색인 상태 : ${ix.coverageState || '(없음)'}`);
    console.log(`   robots    : ${ix.robotsTxtState || '-'} · 가져오기: ${ix.pageFetchState || '-'}`);
    console.log(`   마지막 크롤: ${ix.lastCrawlTime || '아직 없음'}`);
    console.log(`   참조 사이트맵: ${(ix.sitemap || []).join(', ') || '없음'}`);
    console.log(`   참조 페이지  : ${(ix.referringUrls || []).join(', ') || '없음'}`);
    if (ix.googleCanonical && ix.userCanonical && ix.googleCanonical !== ix.userCanonical) {
      console.log(`   ⚠ 대표주소 불일치 — 우리: ${ix.userCanonical}`);
      console.log(`                       구글: ${ix.googleCanonical}`);
    }
    const tip = ADVICE[ix.coverageState];
    if (tip) console.log(`   → ${tip}`);
    if (i.inspectionResultLink) console.log(`   화면에서 보기: ${i.inspectionResultLink}`);
  }
  console.log('');
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
