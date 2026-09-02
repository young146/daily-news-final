// ════════════════════════════════════════════════════════════════
// 기존 여행 기사 재활용 후보 찾기 (읽기 전용)
// ────────────────────────────────────────────────────────────────
// 왜: 2026-09-02 조사에서 확인 — chaovietnam 의 여행 기사는 **에버그린**이다.
//     (노출의 상위3일 집중도 8~10%. 데일리 뉴스는 100% = 하루 반짝, 여행 기사는 91일 내내)
//     그런데 순위가 7~10위(1페이지 바닥~2페이지)에 앉아 클릭이 거의 0 이다.
//     원인은 제목: 잡지 제목("Travel - LCC의 위기. 그 이유는?")이라 검색어와 안 맞는다.
//     → 새 글을 쓰는 것보다 **이미 순위가 있는 글의 제목을 고치는 게 훨씬 빠르다.**
//
// 무엇을: WP 여행 카테고리 글 전체 ↔ GSC 성과를 대조해 "고치면 이득인 순서"로 낸다.
//   ① 노출은 많은데 CTR 낮음     → 제목·설명만 고쳐도 클릭이 는다 (최우선)
//   ② 8~20위                    → 조금 보강하면 1페이지 (본문 보강)
//   ③ 실제로 걸리는 검색어를 함께 출력 → 그 검색어를 제목에 넣으면 된다
//
// 실행: node scripts/gsc-travel-rewrite-candidates.js [--days 90] [--min-imp 50]
// 인증: search-console-report.js 와 동일 (FIREBASE_SERVICE_ACCOUNT_JSON)
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const { GoogleAuth } = require('google-auth-library');

const API = 'https://www.googleapis.com/webmasters/v3';
const WP = 'https://chaovietnam.co.kr/wp-json/wp/v2';
const SITE = process.env.SEARCH_CONSOLE_SITE || 'sc-domain:chaovietnam.co.kr';
const LAG = 3;

const args = process.argv.slice(2);
const pick = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : def;
};
const DAYS = pick('--days', 90);
const MIN_IMP = pick('--min-imp', 50);

// 여행·라이프 계열 카테고리 (id → 이름). categories 목록에서 확인한 값.
const CATS = [
  [29, 'TRAVEL'], [7, '라이프&조이&트래블'], [413, 'GOLF & SPORTS'],
  [342, 'Golf 칼럼'], [427, 'F&R(Food&Restaurant)'], [8, '베트남맛집'],
  [349, 'Life & Food'], [4, 'VN Information'],
];

const ymd = (d) => d.toISOString().slice(0, 10);
const ago = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };
const dec = (s) => s.replace(/&#8217;|&#8216;/g, "'").replace(/&#8211;|&#8212;/g, '-')
  .replace(/&amp;/g, '&').replace(/&#[0-9]+;/g, '').replace(/&[a-z]+;/g, '');

let _c = null;
async function token() {
  if (!_c) {
    const opts = { scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] };
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      opts.credentials = { client_email: sa.client_email, private_key: sa.private_key };
    }
    _c = await new GoogleAuth(opts).getClient();
  }
  return (await _c.getAccessToken()).token;
}

async function gsc(t, dimensions, filters, rowLimit = 25000) {
  const body = {
    startDate: ymd(ago(LAG + DAYS)), endDate: ymd(ago(LAG)),
    dimensions, rowLimit, dataState: 'final',
  };
  if (filters) body.dimensionFilterGroups = [{ filters }];
  const r = await fetch(`${API}/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GSC ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).rows || [];
}

/** 카테고리의 모든 글을 페이지네이션으로 긁는다 (id → {title, date}) */
async function fetchCategory(id) {
  const out = new Map();
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${WP}/posts?categories=${id}&per_page=100&page=${page}&_fields=id,title,date`);
    if (!r.ok) break;                       // 마지막 페이지 넘어가면 400
    const ps = await r.json();
    if (!ps.length) break;
    for (const p of ps) out.set(p.id, { title: dec(p.title.rendered), date: p.date.slice(0, 10) });
    const total = parseInt(r.headers.get('x-wp-totalpages') || '1', 10);
    if (page >= total) break;
  }
  return out;
}

(async () => {
  const t = await token();

  // 1) 여행 계열 글 전체 수집
  const posts = new Map();
  const catOf = new Map();
  for (const [id, name] of CATS) {
    const m = await fetchCategory(id);
    for (const [pid, meta] of m) {
      if (!posts.has(pid)) { posts.set(pid, meta); catOf.set(pid, name); }
    }
    console.error(`  [${name}] ${m.size}편`);
  }
  console.log(`■ 여행·라이프 계열 글 총 ${posts.size.toLocaleString()}편 (중복 제거)`);

  // 2) GSC 페이지 성과 → 글 id 로 매핑
  const pages = await gsc(t, ['page']);
  const perf = new Map();
  for (const r of pages) {
    const m = decodeURIComponent(r.keys[0]).match(/\/(\d+)\/?$/);
    if (!m) continue;
    const id = parseInt(m[1], 10);
    if (!posts.has(id)) continue;
    perf.set(id, { imp: r.impressions, clicks: r.clicks, ctr: r.ctr, pos: r.position });
  }

  const tot = [...perf.values()].reduce((a, v) => ({
    imp: a.imp + v.imp, clicks: a.clicks + v.clicks,
  }), { imp: 0, clicks: 0 });

  console.log(`■ 최근 ${DAYS}일 검색 노출된 글 ${perf.size.toLocaleString()}편 ` +
    `(${(perf.size / posts.size * 100).toFixed(0)}%) · 노출 ${Math.round(tot.imp).toLocaleString()} · ` +
    `클릭 ${Math.round(tot.clicks).toLocaleString()} · CTR ${(tot.clicks / tot.imp * 100).toFixed(2)}%`);

  // 3) 고치면 이득인 순서 = 노출 × (놓친 CTR)
  //    8위 근처의 정상 CTR 을 2.5% 로 보고, 그보다 낮은 만큼을 '놓친 클릭'으로 센다.
  const BASE_CTR = 0.025;
  const cands = [...perf.entries()]
    .filter(([, v]) => v.imp >= MIN_IMP)
    .map(([id, v]) => ({
      id, ...v, ...posts.get(id), cat: catOf.get(id),
      missed: Math.max(0, v.imp * BASE_CTR - v.clicks),
    }))
    .sort((a, b) => b.missed - a.missed);

  const TOP = pick('--top', 30);
  const SKIP = pick('--skip', 0);
  console.log(`\n${'='.repeat(100)}`);
  console.log(`★ 제목만 고쳐도 이득인 글 (노출 ${MIN_IMP}+ · 놓친 클릭 순) — ${SKIP + 1}~${SKIP + TOP}위`);
  console.log('='.repeat(100));
  for (const c of cands.slice(SKIP, SKIP + TOP)) {
    console.log(`\n[${c.id}] ${c.title.slice(0, 62)}`);
    console.log(`   노출 ${String(Math.round(c.imp)).padStart(6)} · 클릭 ${String(Math.round(c.clicks)).padStart(4)}` +
      ` · CTR ${(c.ctr * 100).toFixed(2).padStart(5)}% · ${c.pos.toFixed(1).padStart(5)}위` +
      ` · 놓친 클릭 ≈ ${Math.round(c.missed)}  [${c.cat} · ${c.date}]`);
    // 실제로 걸리는 검색어 = 제목에 넣을 말
    const qs = await gsc(t, ['query'], [{ dimension: 'page', operator: 'contains', expression: `/${c.id}/` }], 10);
    qs.sort((a, b) => b.impressions - a.impressions);
    const top = qs.slice(0, 4).map((q) =>
      `"${q.keys[0]}"(${Math.round(q.impressions)}·${q.position.toFixed(0)}위)`).join('  ');
    if (top) console.log(`   걸리는 검색어: ${top}`);
  }

  const sumMissed = cands.reduce((a, c) => a + c.missed, 0);
  console.log(`\n${'='.repeat(100)}`);
  console.log(`후보 ${cands.length}편 · 놓치고 있는 클릭 합계 ≈ ${Math.round(sumMissed).toLocaleString()}회 / ${DAYS}일`);
  console.log(`(기준: 8위권 정상 CTR 2.5% 대비 부족분. 제목·설명 개선으로 회수 가능한 몫의 근사치)`);
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
