// ════════════════════════════════════════════════════════════════
// 주간 GSC 실검색어 수집 (Weekly Google Search Console query fetch)
// ────────────────────────────────────────────────────────────────
// 무엇: 구글 서치콘솔에서 "실제로 사람들이 쳐서 chaovietnam.co.kr 에 들어온/노출된
//       검색어"(최근 28일)를 조회해 카테고리별로 분류하고 lib/gsc-keywords.generated.js
//       에 기록한다. 이 데이터는 "우리 콘텐츠에 대한 진짜 검색 수요" 이므로,
//       번역 제목/키워드 프롬프트에서 네이버 검색량보다 우선 반영한다.
// 언제: 주 1회 (weekly-keywords.yml GitHub Action) → `npm run keywords:gsc`
//
// 인증: search-console-report.js 와 동일. FIREBASE_SERVICE_ACCOUNT_JSON 이 있으면 그걸,
//       없으면 GOOGLE_APPLICATION_CREDENTIALS(ADC)를 사용. 스코프 webmasters.readonly.
// 전제(1회 콘솔 작업): 서치콘솔 → 설정 → 사용자 및 권한에 서비스계정 추가 +
//                     GCP에서 "Search Console API" Enable. (미완이면 아래처럼 우아하게 skip)
//
// 안전장치: 크레덴셜/권한/데이터가 없으면 경고만 출력하고 exit 0. 기존 generated 파일을
//           덮어쓰지 않으므로 시스템은 계속 정상 동작한다(네이버+baseline 그대로).
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const API = 'https://www.googleapis.com/webmasters/v3';
const LAG_DAYS = 3;   // GSC 데이터는 2~3일 지연 → 오늘-3일까지
const WINDOW_DAYS = 28; // 최근 28일 (주 단위 변동에 안정적)
const ROW_LIMIT = 250;

// 카테고리 판별 토큰 (검색어에 이 토큰이 있으면 그 카테고리로 분류; 위에서부터 먼저 매칭).
// lib/popular-keywords.js 의 카테고리 키와 일치시킬 것.
const CATEGORY_TOKENS = [
  ['Travel', ['여행', '항공권', '리조트', '호텔', '관광', '날씨', '다낭', '나트랑', '나짱', '푸꾸옥', '달랏', '하롱', '호이안', '사파', '붕따우', '한달살기']],
  ['Real Estate', ['부동산', '아파트', '집값', '임대', '매매', '미딩', '서호', '분양', '오피스텔']],
  ['Economy', ['환율', '환전', '베트남동', '베트남돈', '경제', '최저임금', '물가', '주식', '투자', '무역', 'gdp']],
  ['Korea-Vietnam', ['비자', '입국', '무비자', 'evisa', '취업', '이민', '번역', '한인', '진출']],
  ['Food', ['쌀국수', '월남쌈', '음식', '커피', '맛집', '식당', '반미', '분짜', '요리']],
  ['Health', ['병원', '뎅기열', '예방접종', '건강', '백신', '의료']],
  ['Culture', ['축구', '문화', '드라마', '연예', '영화', '스포츠']],
  ['Politics', ['총리', '정치', '정부', '정책', '주석', '선거']],
  ['Community', ['교민', '한인회', '코참', 'kocham']],
  ['International', ['관세', '미국', '중국', '수출']],
  ['Society', ['뉴스', '사건', '사고', '사회', '메트로', '교통']],
];

function categorize(query) {
  const q = query.toLowerCase().replace(/\s+/g, '');
  for (const [cat, tokens] of CATEGORY_TOKENS) {
    if (tokens.some((t) => q.includes(t.toLowerCase()))) return cat;
  }
  return null; // 미분류 → 풀에 넣지 않음(제목이 엉뚱해지는 것 방지)
}

// 베트남 관련 여부 필터 — 20년 된 사이트라 GSC엔 "프랑스축구·월드컵미국" 같은
// 베트남 무관 검색어도 잔뜩 잡힌다. 이런 걸 제목 생성에 넣으면 오히려 해로우므로,
// 명시적 베트남 신호가 있는 검색어만 통과시킨다(네이버 수집 스크립트와 동일 정책).
const VN_TOKENS = [
  '베트남', '다낭', '하노이', '호치민', '호찌민', '나트랑', '나짱', '푸꾸옥', '달랏',
  '호이안', '하롱', '사파', '붕따우', '껀터', '후에', '베트남동', '베트남어', '월남',
  '비엣', '한베', '메콩', 'vietnam', '베트남동환율',
];
function isVietnamRelated(kw) {
  const q = kw.toLowerCase().replace(/\s+/g, '');
  return VN_TOKENS.some((t) => q.includes(t.toLowerCase()));
}

// 브랜드/자사명·잡음 검색어 제외 (우리 사이트를 이미 아는 사람이 친 것 → SEO 확장 가치 낮음)
const BRAND_RE = /(씬짜오|xinchao|chaovietnam|차오베트남|씬차오)/i;
const hasHangul = (s) => /[가-힣]/.test(s);

function ymd(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }

async function getToken() {
  const opts = { scopes: SCOPES };
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    opts.credentials = { client_email: sa.client_email, private_key: sa.private_key };
    opts.projectId = sa.project_id;
  }
  const client = await new GoogleAuth(opts).getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Search Console 토큰 발급 실패 (서비스계정/권한 확인)');
  return token;
}

async function resolveSite(token) {
  if (process.env.SEARCH_CONSOLE_SITE) return process.env.SEARCH_CONSOLE_SITE;
  const res = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`sites.list ${res.status} — 서비스계정이 서치콘솔에 추가됐는지 확인`);
  const { siteEntry = [] } = await res.json();
  const sites = siteEntry.map((s) => s.siteUrl);
  const domain = sites.find((s) => s.startsWith('sc-domain:') && s.includes('chaovietnam'));
  const urlp = sites.find((s) => s.includes('chaovietnam.co.kr'));
  const picked = domain || urlp;
  if (!picked) throw new Error(`chaovietnam 속성 접근 불가 (접근가능: ${sites.join(', ') || '없음'})`);
  return picked;
}

async function main() {
  // 크레덴셜 유무 확인 — 없으면 우아하게 skip
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('[gsc] ⚠️ 구글 서비스계정 자격증명이 없습니다(FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS).');
    console.warn('[gsc]   네이버+baseline 키워드를 그대로 유지하고 종료합니다.');
    process.exit(0);
  }

  let token, site, rows;
  try {
    token = await getToken();
    site = await resolveSite(token);
    const end = daysAgo(LAG_DAYS);
    const start = daysAgo(LAG_DAYS + WINDOW_DAYS - 1);
    const res = await fetch(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions: ['query'], rowLimit: ROW_LIMIT }),
    });
    if (!res.ok) throw new Error(`searchAnalytics ${res.status}: ${(await res.text()).slice(0, 150)}`);
    rows = (await res.json()).rows || [];
    console.log(`[gsc] 속성 ${site} — 검색어 ${rows.length}행 수신 (${ymd(start)} ~ ${ymd(end)})`);
  } catch (e) {
    // 권한 미설정(서치콘솔에 서비스계정 미추가) 등 → 기존 파일 유지하고 skip
    console.warn(`[gsc] ⚠️ 서치콘솔 조회 실패 — skip: ${e.message}`);
    console.warn('[gsc]   서치콘솔 → 설정 → 사용자 및 권한에 서비스계정을 추가하면 다음 실행부터 반영됩니다.');
    process.exit(0);
  }

  // 검색어 필터 + 카테고리 분류 + 노출수(impressions) 내림차순
  const byCategory = {};
  let uncategorized = 0;
  for (const r of rows) {
    const kw = (r.keys?.[0] || '').trim();
    if (!kw || !hasHangul(kw) || BRAND_RE.test(kw) || kw.length > 25) continue;
    if (!isVietnamRelated(kw)) continue; // 베트남 무관 검색어(일반 스포츠·월드뉴스 등) 제거
    const impressions = Math.round(r.impressions || 0);
    const clicks = Math.round(r.clicks || 0);
    if (impressions < 5) continue; // 노출 거의 없는 잡음 제거
    const cat = categorize(kw);
    if (!cat) { uncategorized++; continue; }
    (byCategory[cat] ||= []).push({ keyword: kw.replace(/\s+/g, ''), clicks, impressions, position: +(r.position || 0).toFixed(1) });
  }

  // 카테고리별 중복 제거 + 상위 10개
  for (const cat of Object.keys(byCategory)) {
    const seen = new Set();
    byCategory[cat] = byCategory[cat]
      .sort((a, b) => b.impressions - a.impressions)
      .filter((k) => (seen.has(k.keyword) ? false : (seen.add(k.keyword), true)))
      .slice(0, 10);
  }

  const total = Object.values(byCategory).reduce((n, a) => n + a.length, 0);
  if (total === 0) {
    console.warn(`[gsc] ⚠️ 사용할 검색어 0개 (미분류 ${uncategorized}개). 기존 파일 유지하고 종료.`);
    process.exit(0);
  }

  const outPath = path.join(__dirname, '..', 'lib', 'gsc-keywords.generated.js');
  const nowIso = new Date().toISOString();
  const content = `// ⚠️ AUTO-GENERATED — 손으로 수정하지 말 것.
// scripts/fetch-gsc-keywords.js 가 주 1회 실행되며 이 파일을 덮어씁니다.
// 파일이 비어 있어도(byCategory 가 {}) 네이버+baseline 키워드로 정상 동작합니다.
//
// 형식: byCategory[카테고리] = [{ keyword, clicks, impressions, position }] (impressions 내림차순)
// 출처: Google Search Console — "실제로 우리 사이트에 노출/유입된 검색어"(최근 ${WINDOW_DAYS}일)
export const GSC_KEYWORDS = ${JSON.stringify({ updatedAt: nowIso, site, byCategory }, null, 2)};
`;
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`[gsc] ✅ 저장 완료: ${outPath}`);
  console.log(`[gsc]   갱신시각 ${nowIso}, 총 ${total}개 검색어 (미분류 ${uncategorized}개 제외)`);
  for (const [cat, arr] of Object.entries(byCategory)) {
    console.log(`[gsc]   ${cat}: ${arr.slice(0, 3).map((k) => `${k.keyword}(${k.impressions})`).join(', ')}${arr.length > 3 ? ' …' : ''}`);
  }
}

main().catch((e) => {
  console.error('[gsc] 치명적 오류:', e);
  process.exit(1);
});
