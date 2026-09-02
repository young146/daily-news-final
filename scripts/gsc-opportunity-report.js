// ════════════════════════════════════════════════════════════════
// 서치콘솔 "기회" 리포트 (읽기 전용)
// ────────────────────────────────────────────────────────────────
// 무엇: 구글 서치콘솔에서 최근 28일 검색어를 받아 *지금 당장 손보면 트래픽이 붙는 곳*
//       을 찾아낸다. 새 글을 쓰는 것보다 빠른 길을 먼저 보기 위한 자료.
//
//   ① 2페이지 기회  — 순위 8~30위 + 노출 많음. 조금만 보강하면 1페이지로 올라간다.
//   ② 제목 기회     — 1페이지(1~7위)인데 CTR 낮음. 제목·설명만 고쳐도 클릭이 는다.
//   ③ 여행 수요 실측 — 여행 검색어가 실제로 우리에게 얼마나 들어오는지.
//                      (네이버 API 는 "시장 수요", 이건 "우리 몫" — 방향 결정 근거)
//
// 왜 별도 스크립트인가: fetch-gsc-keywords.js 는 lib/gsc-keywords.generated.js 를
//       *덮어쓰는* 생산 파이프라인이다. 이 스크립트는 아무것도 쓰지 않고 화면에만 낸다.
//
// 실행: node scripts/gsc-opportunity-report.js            (chaovietnam 자동 선택)
//       node scripts/gsc-opportunity-report.js --all      (접근 가능한 모든 속성)
//       node scripts/gsc-opportunity-report.js --days 90  (기간 변경)
//
// 인증: search-console-report.js 와 동일 (FIREBASE_SERVICE_ACCOUNT_JSON).
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const { GoogleAuth } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const API = 'https://www.googleapis.com/webmasters/v3';
const LAG_DAYS = 3;

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const DAYS = (() => {
  const i = args.indexOf('--days');
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : 28;
})();

// 여행 의도 검색어 판별 — 네이버 조사와 같은 토큰 체계
const TRAVEL = ['여행', '항공권', '리조트', '호텔', '숙소', '관광', '날씨', '패키지',
  '가볼만한곳', '맛집', '풀빌라', '한달살기', '골프', '환전', '환율', '비자', '이심', '유심'];
const CITY = ['다낭', '나트랑', '나짱', '푸꾸옥', '달랏', '하롱', '호이안', '사파',
  '붕따우', '무이네', '퀴논', '판티엣', '후에'];

const ymd = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const num = (v, n = 8) => String(Math.round(v).toLocaleString('ko-KR')).padStart(n);
const pct = (v, n = 6) => (v * 100).toFixed(1).padStart(n - 1) + '%';

let _client = null;
async function getToken() {
  if (!_client) {
    const opts = { scopes: SCOPES };
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      opts.credentials = { client_email: sa.client_email, private_key: sa.private_key };
      opts.projectId = sa.project_id;
    }
    _client = await new GoogleAuth(opts).getClient();
  }
  const { token } = await _client.getAccessToken();
  if (!token) throw new Error('토큰 발급 실패 — 서비스계정 권한 확인');
  return token;
}

async function listSites(token) {
  const res = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`sites.list ${res.status} — 서비스계정이 서치콘솔에 추가됐는지 확인`);
  const { siteEntry = [] } = await res.json();
  return siteEntry.map((s) => s.siteUrl);
}

async function queryRows(token, site, dimensions, rowLimit = 25000) {
  const body = {
    startDate: ymd(daysAgo(LAG_DAYS + DAYS)),
    endDate: ymd(daysAgo(LAG_DAYS)),
    dimensions,
    rowLimit,
    dataState: 'final',
  };
  const res = await fetch(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`query ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { rows = [] } = await res.json();
  return rows.map((r) => ({
    q: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

function isTravel(q) {
  const s = q.toLowerCase().replace(/\s+/g, '');
  return TRAVEL.some((t) => s.includes(t)) || CITY.some((c) => s.includes(c));
}

function section(title) {
  console.log('\n' + '═'.repeat(96));
  console.log(title);
  console.log('═'.repeat(96));
}

function table(rows, n) {
  console.log(`${pad('검색어', 34)}${'클릭'.padStart(8)}${'노출'.padStart(10)}${'CTR'.padStart(7)}${'순위'.padStart(7)}`);
  console.log('─'.repeat(96));
  for (const r of rows.slice(0, n)) {
    console.log(`${pad(r.q, 34)}${num(r.clicks)}${num(r.impressions, 10)}${pct(r.ctr, 7)}${r.position.toFixed(1).padStart(7)}`);
  }
}

async function report(token, site) {
  section(`속성: ${site}   ·   최근 ${DAYS}일 (${ymd(daysAgo(LAG_DAYS + DAYS))} ~ ${ymd(daysAgo(LAG_DAYS))})`);

  const rows = await queryRows(token, site, ['query']);
  if (!rows.length) { console.log('데이터 없음 (권한 또는 트래픽 부재)'); return; }

  const tot = rows.reduce((a, r) => ({
    clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions,
  }), { clicks: 0, impressions: 0 });

  console.log(`검색어 ${rows.length.toLocaleString('ko-KR')}개 · 클릭 ${tot.clicks.toLocaleString('ko-KR')} · ` +
    `노출 ${tot.impressions.toLocaleString('ko-KR')} · CTR ${(tot.clicks / tot.impressions * 100).toFixed(2)}%`);

  // ── 상위 검색어 ──
  section('[1] 지금 우리를 먹여살리는 검색어 (클릭 순)');
  table([...rows].sort((a, b) => b.clicks - a.clicks), 30);

  // ── 2페이지 기회 ──
  section('[2] ★ 2페이지 기회 — 순위 8~30위 + 노출 많음 (조금 보강하면 1페이지)');
  const p2 = rows.filter((r) => r.position >= 8 && r.position <= 30 && r.impressions >= 50)
    .sort((a, b) => b.impressions - a.impressions);
  console.log(`해당 ${p2.length.toLocaleString('ko-KR')}개 · 잠재 노출 ${p2.reduce((a, r) => a + r.impressions, 0).toLocaleString('ko-KR')}\n`);
  table(p2, 40);

  // ── 제목 기회 ──
  section('[3] ★ 제목 기회 — 1페이지(1~7위)인데 CTR 낮음 (제목·설명만 고쳐도 클릭 증가)');
  const lowCtr = rows.filter((r) => r.position <= 7 && r.impressions >= 100 && r.ctr < 0.05)
    .sort((a, b) => b.impressions - a.impressions);
  console.log(`해당 ${lowCtr.length.toLocaleString('ko-KR')}개\n`);
  table(lowCtr, 25);

  // ── 여행 수요 실측 ──
  section('[4] ★ 여행 의도 검색어 — 우리에게 실제로 들어오는 양 (방향 결정 근거)');
  const tr = rows.filter((r) => isTravel(r.q));
  const trTot = tr.reduce((a, r) => ({
    clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions,
  }), { clicks: 0, impressions: 0 });
  console.log(`여행 검색어 ${tr.length.toLocaleString('ko-KR')}개 / 전체 ${rows.length.toLocaleString('ko-KR')}개 ` +
    `(${(tr.length / rows.length * 100).toFixed(1)}%)`);
  console.log(`클릭 ${trTot.clicks.toLocaleString('ko-KR')} (전체의 ${(trTot.clicks / tot.clicks * 100).toFixed(1)}%) · ` +
    `노출 ${trTot.impressions.toLocaleString('ko-KR')} (전체의 ${(trTot.impressions / tot.impressions * 100).toFixed(1)}%)`);
  console.log(`평균 순위 ${(tr.reduce((a, r) => a + r.position * r.impressions, 0) / (trTot.impressions || 1)).toFixed(1)}위\n`);
  table([...tr].sort((a, b) => b.impressions - a.impressions), 30);

  // ── 환율 검증 ──
  section('[5] 환율·환전 검색어 — 계산기 페이지 타당성 검증');
  const fx = rows.filter((r) => /환율|환전|베트남동|베트남돈|동환율/.test(r.q))
    .sort((a, b) => b.impressions - a.impressions);
  if (fx.length) {
    console.log(`해당 ${fx.length}개 · 클릭 ${fx.reduce((a, r) => a + r.clicks, 0).toLocaleString('ko-KR')} · ` +
      `노출 ${fx.reduce((a, r) => a + r.impressions, 0).toLocaleString('ko-KR')}\n`);
    table(fx, 20);
  } else {
    console.log('환율 관련 검색어로 들어오는 트래픽 없음 — 페이지가 없으니 당연. 만들면 새로 생기는 몫.');
  }
}

(async () => {
  try {
    const token = await getToken();
    const sites = await listSites(token);
    console.log(`접근 가능한 속성 ${sites.length}개: ${sites.join(', ') || '없음'}`);
    if (!sites.length) {
      console.log('\n⚠ 서치콘솔 → 설정 → 사용자 및 권한 에 서비스계정을 추가해야 합니다.');
      process.exit(0);
    }
    const targets = ALL ? sites
      : [sites.find((s) => s.startsWith('sc-domain:') && s.includes('chaovietnam'))
        || sites.find((s) => s.includes('chaovietnam.co.kr')) || sites[0]];
    for (const site of targets) {
      try { await report(token, site); }
      catch (e) { console.log(`\n[${site}] 실패: ${e.message}`); }
    }
  } catch (e) {
    console.error('실패:', e.message);
    process.exit(1);
  }
})();
