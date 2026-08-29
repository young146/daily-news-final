/**
 * 뉴스레터 "진짜 클릭률" — 메일을 눌러 실제로 사이트에 도착한 사람을 센다.
 * =====================================================================
 * 왜 필요한가 (2026-08-29):
 *   SendGrid 대시보드의 클릭 수치는 **쓸 수 없다.** 우리가 발송코드에서
 *   SendGrid 자체 추적을 꺼 놨기 때문이다 (lib/email-service.js 의
 *   trackingSettings 주석에 근거가 있다):
 *     1. 회사 메일 보안 스캐너가 링크를 미리 눌러대서 사람 클릭과 구분이 안 된다
 *        (실측: 클릭 21,866 > 사이트 전체 세션 11,071 = 물리적으로 불가능)
 *     2. SendGrid 의 ganalytics 가 우리 utm_source=email 을 sendgrid.com 으로
 *        덮어써서 GA4 에서 이메일 유입이 실제의 1/9 로 축소돼 보였다
 *
 *   그래서 대시보드 클릭은 **영원히 0 이고, 그게 맞다.** 진짜 클릭은 여기서 센다.
 *   (0 을 보고 "추적이 고장났나" 하고 설정을 다시 켜면 위 두 문제가 되돌아온다)
 *
 * 어떻게 세는가:
 *   진짜 클릭률 = GA4 뉴스레터 세션 ÷ SendGrid 실제 도달 통수
 *
 *   lib/email-service.js 의 addUtmToHtml() 이 본문의 모든 링크에
 *   utm_medium=newsletter & utm_campaign=daily_news_YYYYMMDD 를 붙여 보낸다.
 *   캠페인 이름에 발송일이 박혀 있으므로 **어느 날 메일이 몇 명을 데려왔는지**
 *   하루 단위로 갈라진다.
 *
 * ⚠️ 오늘·어제 수치는 아직 안 굳었다. 메일은 며칠에 걸쳐 계속 열리고 눌린다
 *   (8/28 발송분이 당일 250 → 다음날 262 로 늘었다). 2~3일 지나야 확정치다.
 *
 * 쓰는 법:
 *   node scripts/newsletter-ctr.mjs                       # 최근 14일 요약표
 *   node scripts/newsletter-ctr.mjs --days 30
 *   node scripts/newsletter-ctr.mjs --campaign 20260825   # 그날 어느 기사가 끌었나
 *
 * 필요 환경변수:
 *   SENDGRID_API_KEY               (.env.local) — 도달·오픈 통수
 *   FIREBASE_SERVICE_ACCOUNT_JSON  (.env)       — GA4 Data API 인증
 *   GA4_PROPERTY_ID (선택)         — 없으면 measurement ID 로 자동 탐색
 *
 * 참고: 이 저장소의 시크릿이 .env 와 .env.local 두 곳에 나뉘어 있다
 *   (SENDGRID_API_KEY 는 .env.local 에만 있다). 그래서 두 파일을 모두 읽는다.
 *   `import 'dotenv/config'` 만 쓰면 .env 만 읽어 SendGrid 블록이 조용히 비어버린다.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const ga = await import(pathToFileURL(path.join(process.cwd(), 'lib/ga4-report.js')).href);

const C = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' };
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const DAYS = Number(argOf('--days', 14));
const CAMPAIGN_DAY = argOf('--campaign', null);

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const TODAY = ymd(new Date());
const YESTERDAY = ymd(new Date(Date.now() - 864e5));
const pad = (v, n) => String(v).padStart(n);

const propertyId = await ga.resolvePropertyId();

// ─── 캠페인 상세 모드 — 그날 메일이 어느 기사로 사람을 보냈나 ────────────────
//
// 두 가지를 따로 보여준다. 한 표에 섞으면 (착륙지 × 그 세션이 본 페이지) 로
// 행이 쪼개져 같은 기사가 여러 줄에 흩어진다.
//   (1) 어디로 들어왔나 — 제목을 직접 눌렀나, 「전체 보기」로 들어왔나
//   (2) 무엇을 읽었나   — 그날의 '끌개' 기사와 그 기사에 머문 시간
if (CAMPAIGN_DAY) {
    const campaign = `daily_news_${CAMPAIGN_DAY}`;
    const campaignFilter = {
        filter: { fieldName: 'sessionCampaignName', stringFilter: { matchType: 'EXACT', value: campaign } },
    };

    const landing = await ga.runReport(propertyId, {
        dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'landingPagePlusQueryString' }],
        metrics: [{ name: 'sessions' }, { name: 'bounceRate' }],
        dimensionFilter: campaignFilter,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
    });
    console.log(`\n${C.b}■ ${campaign} — ① 어디로 들어왔나${C.x}\n`);
    console.log(`  ${'세션'.padStart(5)}  ${'이탈률'.padStart(6)}  착륙 페이지`);
    console.log(`  ${'─'.repeat(60)}`);
    for (const row of landing.rows || []) {
        const page = decodeURIComponent(row.dimensionValues[0].value);
        const bounce = (Number(row.metricValues[1].value || 0) * 100).toFixed(1);
        console.log(`  ${pad(row.metricValues[0].value, 5)}  ${pad(bounce + '%', 6)}  ${page.slice(0, 46)}`);
    }
    console.log(`${C.dim}  ※ /daily-news-terminal/?v=MMDD = 「오늘의 뉴스 전체」로 들어온 것${C.x}`);
    console.log(`${C.dim}     /숫자/ = 기사 제목을 직접 눌러 들어온 것 — 이게 그날의 '끌개'다${C.x}`);

    const pages = await ga.runReport(propertyId, {
        dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }, { name: 'userEngagementDuration' }],
        dimensionFilter: campaignFilter,
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 12,
    });
    console.log(`\n${C.b}■ ${campaign} — ② 무엇을 읽었나${C.x}\n`);
    console.log(`  ${'조회'.padStart(5)}  ${'체류'.padStart(5)}  기사`);
    console.log(`  ${'─'.repeat(72)}`);
    for (const row of pages.rows || []) {
        const [pagePath, title] = row.dimensionValues.map((v) => v.value);
        const [views, sessions, duration] = row.metricValues.map((v) => Number(v.value || 0));
        if (views < 5) continue;
        // 체류시간이 짧으면 "눌렀다가 아니네 하고 나간 것" — 오인 유입을 가려낸다
        const dwell = sessions ? Math.round(duration / sessions) : 0;
        const name = title.replace(' - Xin Chao Vietnam', '') || pagePath;
        console.log(`  ${pad(views, 5)}  ${pad(dwell + '초', 5)}  ${name.slice(0, 58)}`);
    }
    console.log(`${C.dim}  ※ 체류가 짧은데 조회가 많으면 = 제목에 낚여 들어왔다가 바로 나간 것.${C.x}`);
    console.log(`${C.dim}     체류가 길면 = 진짜로 읽었다. 그 주제를 또 다루면 된다.${C.x}\n`);
} else {

// ─── 1) GA4 — 캠페인별 누적 세션 (utm_medium=newsletter) ─────────────────────
const gaResp = await ga.runReport(propertyId, {
    dateRanges: [{ startDate: `${DAYS}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'sessionCampaignName' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
    dimensionFilter: {
        filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'newsletter' } },
    },
    limit: 500,
});
const campaigns = {};
for (const row of gaResp.rows || []) {
    // 일간 뉴스레터만 본다. ad_promo / xinchao_hub 등 다른 메일은 발송 통수가
    // 따로 잡히지 않아 같은 표에 섞으면 클릭률이 왜곡된다.
    const m = /^daily_news_(\d{8})/.exec(row.dimensionValues[0].value);
    if (!m) continue;
    const d = m[1];
    campaigns[d] = campaigns[d] || { sessions: 0, users: 0 };
    campaigns[d].sessions += Number(row.metricValues[0].value || 0);
    campaigns[d].users += Number(row.metricValues[1].value || 0);
}

// ─── 2) SendGrid — 일별 도달·오픈 ────────────────────────────────────────────
const sendgrid = {};
const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
    console.log(`\n${C.r}⚠️  SENDGRID_API_KEY 없음 (.env.local 확인) — 도달 통수를 못 읽어 클릭률 계산 불가.${C.x}`);
} else {
    const iso = (d) => d.toISOString().slice(0, 10);
    const startDate = iso(new Date(Date.now() - DAYS * 864e5));
    const endDate = iso(new Date());
    const res = await fetch(
        `https://api.sendgrid.com/v3/stats?start_date=${startDate}&end_date=${endDate}&aggregated_by=day`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!res.ok) {
        console.log(`\n${C.r}SendGrid stats 실패(${res.status}): ${(await res.text()).slice(0, 150)}${C.x}`);
    } else {
        for (const row of await res.json()) {
            const m = row.stats?.[0]?.metrics || {};
            sendgrid[row.date.replace(/-/g, '')] = {
                delivered: m.delivered || 0,
                uniqueOpens: m.unique_opens || 0,
                bounces: m.bounces || 0,
            };
        }
    }
}

// ─── 3) 표 ───────────────────────────────────────────────────────────────────
console.log(`\n${C.b}■ 뉴스레터 진짜 클릭률 — 최근 ${DAYS}일${C.x}`);
console.log(`${C.dim}  GA4 방문 ÷ SendGrid 도달. SendGrid 대시보드의 클릭(0)은 무시할 것.${C.x}\n`);
console.log(`  발송일      도달   순오픈  오픈율    방문  ${C.b}진짜클릭률${C.x}    오픈→방문`);
console.log(`  ${'─'.repeat(64)}`);

const rows = [];
const allDates = [...new Set([...Object.keys(campaigns), ...Object.keys(sendgrid)])].sort();
for (const d of allDates) {
    const sg = sendgrid[d];
    if (!sg || !sg.delivered) continue; // 발송이 없던 날(일요일 등)은 건너뛴다
    const c = campaigns[d];
    const visits = c ? c.sessions : 0;
    const ctr = (visits / sg.delivered) * 100;
    const ctor = sg.uniqueOpens ? (visits / sg.uniqueOpens) * 100 : 0;
    const fresh = d === TODAY || d === YESTERDAY; // 아직 안 굳은 날
    rows.push({ date: d, ctr, fresh });

    const mark = ctr >= 7 ? `${C.g}🔥${C.x}` : (ctr < 3 && !fresh ? `${C.y}↓ ${C.x}` : '  ');
    const openRate = ((sg.uniqueOpens / sg.delivered) * 100).toFixed(1) + '%';
    console.log(
        `  ${d.slice(4, 6)}/${d.slice(6)}  ${pad(sg.delivered.toLocaleString(), 7)}  ${pad(sg.uniqueOpens.toLocaleString(), 6)}  ${pad(openRate, 6)}  ${pad(visits, 6)}  ${pad(ctr.toFixed(2) + '%', 8)} ${mark}  ${pad(ctor.toFixed(1) + '%', 7)}` +
        (fresh ? `  ${C.dim}⏳집계중${C.x}` : ''),
    );
}

const settled = rows.filter((r) => !r.fresh);
if (settled.length) {
    const avg = settled.reduce((a, r) => a + r.ctr, 0) / settled.length;
    const best = settled.reduce((a, r) => (r.ctr > a.ctr ? r : a));
    console.log(`  ${'─'.repeat(64)}`);
    console.log(`  확정 ${settled.length}일 평균 ${C.b}${avg.toFixed(2)}%${C.x}    최고 ${C.g}${best.ctr.toFixed(2)}%${C.x} (${best.date.slice(4, 6)}/${best.date.slice(6)})`);
    console.log(`\n${C.dim}  업계 평균: 클릭률 2~3%, 오픈→방문 10~15%.${C.x}`);
    console.log(`${C.dim}  🔥(7% 이상)는 그날 콘텐츠가 통한 날이다. 무엇이 통했는지 보려면:${C.x}`);
    console.log(`${C.dim}      node scripts/newsletter-ctr.mjs --campaign ${best.date}${C.x}`);
    console.log(`${C.dim}  ⏳집계중 = 아직 안 굳은 수치. 2~3일 뒤 다시 볼 것.${C.x}\n`);
}

} // ← 요약표 모드 끝 (--campaign 이 없을 때만 여기까지 온다)
