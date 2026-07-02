// =============================================================================
//  씬짜오 통합 데이터 리뷰 리포트  (Read-only)
// =============================================================================
//  목적: 마케팅 깔때기/KPI를 한 번에 끌어와 "활성화 방안"의 90일 목표표와 대조.
//  설계: 데이터 소스 4개를 독립적으로 시도하고, 자격증명이 없으면 그 블록만
//        "막힘(BLOCKED)"으로 표시하고 나머지는 계속 출력한다 (graceful degradation).
//
//  소스:
//    1) Postgres (DATABASE_URL)        — 항상 시도. 구독자 + 이메일 클릭(ClickLog)
//    2) Firebase Admin (서비스계정)     — 있으면. 앱 가입자 + Firestore 공급량 + 중복
//    3) GA4 Data API (property + 권한)  — 있으면. 깔때기 행동 이벤트
//
//  사용법:
//    node scripts/analytics-report.js
//    node scripts/analytics-report.js --days 30      (기간 변경, 기본 7일)
//
//  필요 환경변수 (.env / .env.local):
//    DATABASE_URL                  (이미 있음)
//    FIREBASE_SERVICE_ACCOUNT_JSON (Firebase 콘솔 → 서비스계정 → 새 비공개 키)
//    GA4_PROPERTY_ID               (GA4 관리 → 속성 설정. 숫자. 콤마로 여러 개 가능)
//      또는 GA4_PROPERTY_ID_APP / GA4_PROPERTY_ID_WEB
// =============================================================================

const path = require('node:path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env.local'), override: true });

// ── 인자 파싱 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const daysArgIdx = argv.indexOf('--days');
const DAYS = daysArgIdx >= 0 ? parseInt(argv[daysArgIdx + 1], 10) || 7 : 7;
const sinceDate = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

// ── 출력 헬퍼 ────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
};
const h1 = (s) => console.log(`\n${C.bold}${C.cyan}━━━ ${s} ${'━'.repeat(Math.max(0, 50 - s.length))}${C.reset}`);
const row = (label, val, note = '') =>
  console.log(`  ${label.padEnd(28)} ${C.bold}${String(val).padStart(10)}${C.reset}  ${C.dim}${note}${C.reset}`);
const blocked = (why) => console.log(`  ${C.yellow}⚠ BLOCKED${C.reset} ${C.dim}${why}${C.reset}`);
const ok = (s) => console.log(`  ${C.green}✓${C.reset} ${C.dim}${s}${C.reset}`);
const fmtPct = (n) => `${n.toFixed(1)}%`;

// 수집 결과를 담을 객체 (마지막 KPI 대조표에서 사용)
const M = {
  subscribers: null, newSubs: null,
  clickTotal: null, clickByType: {}, clickUniqueIp: null, terminalClicks: null,
  sendgrid: null,
  appUsers: null, appUsersWithEmail: null, appSignups: null,
  overlapMatched: null, overlapRate: null, overlapUnmatched: null,
  supply: {}, supplyNew24h: {},
  ga4: {},
};

// =============================================================================
//  1) POSTGRES — 구독자 + 이메일 클릭 (항상 시도)
// =============================================================================
async function runPostgres() {
  h1('1. 이메일 자산 (Postgres — 지금 측정 가능)');
  let prisma;
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();

    // 구독자
    const [totalActive, customers, newSubs] = await Promise.all([
      prisma.subscriber.count({ where: { isActive: true } }),
      prisma.subscriber.count({ where: { isActive: true, isCustomer: true } }),
      prisma.subscriber.count({ where: { isActive: true, createdAt: { gte: sinceDate } } }),
    ]);
    M.subscribers = totalActive;
    M.newSubs = newSubs;
    row('활성 구독자', totalActive.toLocaleString(), '데일리 뉴스 수신');
    row('  └ 광고주(isCustomer)', customers.toLocaleString(), '홍보카드 수신 대상');
    row(`  └ 최근 ${DAYS}일 신규`, `+${newSubs}`, '');

    // 이메일 클릭 (ClickLog) — SMTP라 오픈률은 없지만 클릭은 자체 기록됨
    const clickWhere = { clickedAt: { gte: sinceDate } };
    const [clickTotal, byType, uniqueIpRows] = await Promise.all([
      prisma.clickLog.count({ where: clickWhere }),
      prisma.clickLog.groupBy({ by: ['type'], where: clickWhere, _count: { _all: true } }),
      prisma.clickLog.findMany({ where: clickWhere, select: { userIp: true }, distinct: ['userIp'] }),
    ]);
    M.clickTotal = clickTotal;
    M.clickUniqueIp = uniqueIpRows.length;
    console.log('');
    row(`자체 클릭프록시 (최근 ${DAYS}일)`, clickTotal.toLocaleString(), 'ClickLog (레거시)');
    console.log(`  ${C.dim}※ 5/22 이후 이메일 클릭 추적은 SendGrid로 이관됨 → 아래 SendGrid 섹션 참조${C.reset}`);
    for (const t of byType) {
      const cnt = t._count._all;
      M.clickByType[t.type] = cnt;
      if (t.type === 'TERMINAL') M.terminalClicks = cnt;
      const label = t.type === 'TERMINAL' ? 'TERMINAL(앱/터미널 유도)'
        : t.type === 'PROMO' ? 'PROMO(광고카드)'
        : t.type === 'NEWS' ? 'NEWS(뉴스 본문)' : t.type;
      row(`  └ ${label}`, cnt.toLocaleString(), '');
    }

    // 일자별 추세 (최근 7일)
    const daily = await prisma.$queryRaw`
      SELECT to_char("clickedAt", 'MM-DD') AS d, COUNT(*)::int AS c
      FROM "ClickLog"
      WHERE "clickedAt" >= ${new Date(Date.now() - 7 * 864e5)}
      GROUP BY 1 ORDER BY 1`;
    if (daily.length) {
      console.log(`  ${C.dim}일자별 클릭: ${daily.map(r => `${r.d}:${r.c}`).join('  ')}${C.reset}`);
    }
    ok('Postgres 연결 성공');
  } catch (e) {
    blocked(`Postgres 조회 실패: ${e.message}`);
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

// =============================================================================
//  1b) SENDGRID — 이메일 오픈/클릭 (실제 발송 채널)
// =============================================================================
function ymd(d) { return d.toISOString().slice(0, 10); }

async function runSendGrid() {
  h1('1b. 이메일 효과 (SendGrid — 실제 발송 추적)');
  const key = (process.env.SENDGRID_API_KEY || '').trim();
  if (!key) {
    blocked('SENDGRID_API_KEY 없음 → Vercel 환경변수에 있는 키를 로컬 .env 에도 추가 (SendGrid → Settings → API Keys, Stats 읽기 권한이면 충분)');
    return;
  }
  try {
    const start = ymd(sinceDate), end = ymd(new Date());
    const url = `https://api.sendgrid.com/v3/stats?start_date=${start}&end_date=${end}&aggregated_by=day`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) { blocked(`SendGrid API ${res.status}: ${(await res.text()).slice(0, 120)}`); return; }
    const data = await res.json();
    const agg = { requests: 0, delivered: 0, opens: 0, unique_opens: 0, clicks: 0, unique_clicks: 0, bounces: 0, spam_reports: 0, unsubscribes: 0 };
    for (const day of data) for (const s of (day.stats || [])) {
      const m = s.metrics || {};
      for (const k of Object.keys(agg)) agg[k] += m[k] || 0;
    }
    const openRate = agg.delivered ? (agg.unique_opens / agg.delivered) * 100 : 0;
    const clickRate = agg.delivered ? (agg.unique_clicks / agg.delivered) * 100 : 0;
    M.sendgrid = { ...agg, openRate, clickRate };
    row(`발송 요청 (최근 ${DAYS}일)`, agg.requests.toLocaleString(), '');
    row('  └ 전달(delivered)', agg.delivered.toLocaleString(), '');
    row('고유 오픈', agg.unique_opens.toLocaleString(), `오픈률 ${fmtPct(openRate)}`);
    row('고유 클릭', agg.unique_clicks.toLocaleString(), `클릭률(CTR) ${fmtPct(clickRate)}`);
    row('  └ 반송/스팸/수신거부', `${agg.bounces}/${agg.spam_reports}/${agg.unsubscribes}`, '');
    console.log(`  ${C.dim}※ 오픈률은 Apple 메일 프라이버시로 부풀려질 수 있음 → 고유 클릭이 더 신뢰도 높음${C.reset}`);
    console.log(`  ${C.dim}※ 캠페인별 분리는 발송 시 categories 태그 추가하면 가능 (현재는 계정 전체 집계)${C.reset}`);
    ok('SendGrid 통계 조회 성공');
  } catch (e) {
    blocked(`SendGrid 조회 실패: ${e.message}`);
  }
}

// =============================================================================
//  2) FIREBASE — 앱 가입자 + Firestore 공급량 + 이메일↔앱 중복
// =============================================================================
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON); }
    catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 파싱 실패 (한 줄 JSON인지 확인)'); }
  }
  return null; // ADC(GOOGLE_APPLICATION_CREDENTIALS) 로 폴백
}

async function runFirebase() {
  h1('2. 앱 자산 + 공급량 (Firebase)');
  const svc = (() => { try { return loadServiceAccount(); } catch (e) { return { __err: e.message }; } })();
  if (svc && svc.__err) { blocked(svc.__err); return; }
  if (!svc && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    blocked('Firebase 서비스계정 없음 → FIREBASE_SERVICE_ACCOUNT_JSON 를 .env 에 넣어주세요 (콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성)');
    return;
  }
  let admin;
  try {
    admin = require('firebase-admin');
    if (admin.apps.length === 0) {
      admin.initializeApp(svc
        ? { credential: admin.credential.cert(svc) }
        : {} /* ADC */);
    }
  } catch (e) { blocked(`firebase-admin 초기화 실패: ${e.message}`); return; }

  // 2a) Auth — 앱 가입자
  try {
    const auth = admin.auth();
    const appEmails = new Set();
    let total = 0, withEmail = 0, recentSignups = 0;
    let token;
    do {
      const res = await auth.listUsers(1000, token);
      for (const u of res.users) {
        total++;
        if (u.email) { appEmails.add(u.email.toLowerCase().trim()); withEmail++; }
        const created = u.metadata && u.metadata.creationTime ? new Date(u.metadata.creationTime) : null;
        if (created && created >= sinceDate) recentSignups++;
      }
      token = res.pageToken;
    } while (token);
    M.appUsers = total; M.appUsersWithEmail = withEmail; M.appSignups = recentSignups;
    row('앱 가입자 (Firebase Auth)', total.toLocaleString(), '');
    row('  └ 이메일 보유', withEmail.toLocaleString(), '소셜 비공개 제외');
    row(`  └ 최근 ${DAYS}일 신규 가입`, `+${recentSignups}`, '');

    // 2c) 이메일 ↔ 앱 중복 (활성화 방안 "70%가 앱 없음" 검증)
    if (M.subscribers != null) {
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      const subs = await p.subscriber.findMany({ where: { isActive: true }, select: { email: true } });
      await p.$disconnect().catch(() => {});
      const subEmails = new Set(subs.map(s => s.email.toLowerCase().trim()));
      let matched = 0;
      for (const e of subEmails) if (appEmails.has(e)) matched++;
      const rate = subEmails.size ? (matched / subEmails.size) * 100 : 0;
      M.overlapMatched = matched; M.overlapRate = rate;
      M.overlapUnmatched = subEmails.size - matched;
      console.log('');
      row('구독자 ∩ 앱가입자', `${matched}`, `${fmtPct(rate)} (앱 설치 추정)`);
      row('구독자 only (미설치 추정)', M.overlapUnmatched.toLocaleString(), `${fmtPct(100 - rate)} ← 핵심 타겟`);
    }
    ok('Firebase Auth 조회 성공');
  } catch (e) {
    blocked(`Firebase Auth 실패: ${e.message}`);
  }

  // 2b) Firestore — 콘텐츠 공급량
  try {
    const db = admin.firestore();
    const cols = [['Jobs', '채용'], ['RealEstate', '부동산'], ['XinChaoDanggn', '당근/나눔']];
    console.log('');
    for (const [col, label] of cols) {
      const totalSnap = await db.collection(col).count().get();
      const newSnap = await db.collection(col).where('createdAt', '>', since24h).count().get();
      const totalN = totalSnap.data().count;
      const newN = newSnap.data().count;
      M.supply[col] = totalN; M.supplyNew24h[col] = newN;
      row(`${label} 게시글 누적`, totalN.toLocaleString(), `최근 24h +${newN}`);
    }
    ok('Firestore 공급량 조회 성공');
  } catch (e) {
    blocked(`Firestore 실패: ${e.message}`);
  }
}

// =============================================================================
//  3) GA4 — 깔때기 행동 이벤트
// =============================================================================
function ga4PropertyIds() {
  const ids = [];
  if (process.env.GA4_PROPERTY_ID) ids.push(...process.env.GA4_PROPERTY_ID.split(',').map(s => s.trim()).filter(Boolean));
  if (process.env.GA4_PROPERTY_ID_APP) ids.push(process.env.GA4_PROPERTY_ID_APP.trim());
  if (process.env.GA4_PROPERTY_ID_WEB) ids.push(process.env.GA4_PROPERTY_ID_WEB.trim());
  return [...new Set(ids)];
}

async function runGA4() {
  h1('3. 깔때기 행동 이벤트 (GA4)');
  const propIds = ga4PropertyIds();
  if (!propIds.length) {
    blocked('GA4_PROPERTY_ID 없음 → GA4 관리 → 속성 설정에서 숫자 ID 확인 후 .env 에 추가');
    return;
  }
  const svc = (() => { try { return loadServiceAccount(); } catch { return null; } })();
  if (!svc && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    blocked('GA4 인증 자격 없음 (서비스계정 JSON 또는 ADC 필요)');
    return;
  }
  let client;
  try {
    const { BetaAnalyticsDataClient } = require('@google-analytics/data');
    client = new BetaAnalyticsDataClient(svc
      ? { credentials: { client_email: svc.client_email, private_key: svc.private_key }, projectId: svc.project_id }
      : {});
  } catch (e) { blocked(`GA4 클라이언트 생성 실패: ${e.message}`); return; }

  for (const propertyId of propIds) {
    console.log(`\n  ${C.bold}[속성 ${propertyId}]${C.reset}`);
    try {
      // 활성 사용자 (DAU/WAU/MAU)
      const [au] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          { startDate: '1daysAgo', endDate: 'today', name: 'd1' },
          { startDate: '7daysAgo', endDate: 'today', name: 'd7' },
          { startDate: '28daysAgo', endDate: 'today', name: 'd28' },
        ],
        metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }],
      });
      const byRange = {};
      for (const r of au.rows || []) {
        const rng = r.dimensionValues ? r.dimensionValues[0].value : 'd';
        byRange[rng] = { active: +r.metricValues[0].value, neww: +r.metricValues[1].value };
      }
      // dateRange name 은 dimension 'dateRange' 로 들어옴
      M.ga4[propertyId] = M.ga4[propertyId] || {};
      // 단순화를 위해 별도 호출로 명확히
      const pull = async (start) => {
        const [rep] = await client.runReport({
          property: `properties/${propertyId}`,
          dateRanges: [{ startDate: start, endDate: 'today' }],
          metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }],
        });
        const row0 = (rep.rows && rep.rows[0]) ? rep.rows[0].metricValues : null;
        return row0 ? { active: +row0[0].value, neww: +row0[1].value } : { active: 0, neww: 0 };
      };
      const dau = await pull('1daysAgo');
      const wau = await pull('7daysAgo');
      const mau = await pull('28daysAgo');
      M.ga4[propertyId].dau = dau.active; M.ga4[propertyId].wau = wau.active; M.ga4[propertyId].mau = mau.active;
      M.ga4[propertyId].newUsers7 = wau.neww;
      row('DAU (어제~오늘)', dau.active.toLocaleString(), '');
      row('WAU (7일)', wau.active.toLocaleString(), '');
      row('MAU (28일)', mau.active.toLocaleString(), `신규 ${mau.neww.toLocaleString()}`);

      // 주요 이벤트 카운트
      const [ev] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: { values: ['signup_complete', 'welcome_screen_shown', 'first_open', 'session_start', 'magazine_open', 'news_read', 'job_view', 'realestate_view', 'share_clicked'] },
          },
        },
      });
      const evMap = {};
      for (const r of ev.rows || []) evMap[r.dimensionValues[0].value] = +r.metricValues[0].value;
      M.ga4[propertyId].events = evMap;
      console.log(`  ${C.dim}─ 이벤트 (최근 ${DAYS}일) ─${C.reset}`);
      const evLabels = {
        first_open: '앱 첫 실행(설치)', signup_complete: '가입 완료', welcome_screen_shown: '환영화면 노출',
        session_start: '세션 시작', magazine_open: '매거진 열람', news_read: '뉴스 읽음',
        job_view: '채용 조회', realestate_view: '부동산 조회', share_clicked: '공유',
      };
      for (const [k, label] of Object.entries(evLabels)) {
        if (evMap[k] != null) row(`  ${label}`, evMap[k].toLocaleString(), k);
      }

      // 이메일 유입 세션 (UTM)
      const [src] = await client.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
        metrics: [{ name: 'sessions' }],
        limit: 15,
      });
      if (src.rows && src.rows.length) {
        console.log(`  ${C.dim}─ 유입 소스 Top (세션) ─${C.reset}`);
        for (const r of src.rows.slice(0, 8)) {
          const s = r.dimensionValues[0].value, m = r.dimensionValues[1].value;
          row(`  ${s} / ${m}`, (+r.metricValues[0].value).toLocaleString(), '');
        }
      }
      ok(`속성 ${propertyId} 조회 성공`);
    } catch (e) {
      blocked(`속성 ${propertyId} 조회 실패: ${e.message}`);
    }
  }
}

// =============================================================================
//  4) KPI 대조표 — "활성화 방안" 90일 목표 vs 현재
// =============================================================================
function kpiTable() {
  h1('4. KPI 대조 (활성화 방안 90일 목표 대비)');
  const line = (metric, start, target, now, verdict) =>
    console.log(`  ${metric.padEnd(22)} ${C.dim}${String(start).padStart(8)}${C.reset} → ${C.bold}${String(target).padStart(10)}${C.reset}  │ 현재 ${C.cyan}${String(now).padStart(10)}${C.reset}  ${verdict}`);
  console.log(`  ${C.dim}${'지표'.padEnd(20)}   시작점   →   90일목표   │   현재       판정${C.reset}`);
  console.log('  ' + '─'.repeat(72));

  const appNow = M.appUsers != null ? M.appUsers.toLocaleString() : '?';
  line('앱 누적 설치', '2,000', '4,500~5,000', appNow, M.appUsers == null ? '⚠측정필요' : (M.appUsers >= 4500 ? '✅' : '🟡진행'));

  const mauNow = (() => { const v = Object.values(M.ga4)[0]; return v && v.mau != null ? v.mau.toLocaleString() : '?'; })();
  line('MAU', '?', '설치자35%+', mauNow, mauNow === '?' ? '⚠측정필요' : '🟡');

  const convNow = M.overlapRate != null ? fmtPct(M.overlapRate) : '?';
  line('이메일→앱 전환률', '0%', '8%', convNow, M.overlapRate == null ? '⚠측정필요' : (M.overlapRate >= 8 ? '✅' : '🟡'));

  const openNow = M.sendgrid ? fmtPct(M.sendgrid.openRate) : '?';
  line('이메일 오픈률', '?', '25%+', openNow, !M.sendgrid ? '⚠키필요' : (M.sendgrid.openRate >= 25 ? '✅' : '🟡'));
  const ctrNow = M.sendgrid ? fmtPct(M.sendgrid.clickRate) : '?';
  line('  └ 클릭률(CTR)', '?', '—', ctrNow, M.sendgrid ? 'ℹ️SendGrid' : '⚠');

  const kakaoNow = (() => {
    const v = Object.values(M.ga4)[0];
    if (!v || !v.events) return '?';
    // openchat 유입은 위 유입소스에 표시됨
    return 'GA4유입참조';
  })();
  line('카톡→앱 클릭(일)', '0', '50', kakaoNow, '🟡');

  line('jobs-crm 매칭(일)', '0', '20', 'N/A', '❌미가동(액션5)');
  line('광고주 신규계약(월)', '?', '3~5', 'N/A', '⚠CRM별도');

  console.log('  ' + '─'.repeat(72));
  console.log(`  ${C.dim}✅=달성  🟡=진행중  ⚠=측정인프라필요  ❌=구조적/미가동${C.reset}`);
}

// =============================================================================
//  실행
// =============================================================================
(async () => {
  console.log(`${C.bold}\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   씬짜오 통합 데이터 리뷰   (최근 ${String(DAYS).padStart(2)}일 기준)            ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  생성: 동적 / 소스: Postgres · Firebase · GA4${C.reset}`);

  await runPostgres();
  await runSendGrid();
  await runFirebase();
  await runGA4();
  kpiTable();

  console.log(`\n${C.dim}  ※ "막힘(BLOCKED)" 항목은 자격증명을 .env 에 추가하면 자동으로 채워집니다.${C.reset}\n`);
  process.exit(0);
})().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
