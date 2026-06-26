// ============================================================
// 통합검색 색인 빌더 (Layer 3 / 실행)
// 4개 분리 소스를 Neon Postgres `SearchIndex` 한 테이블로 모은다.
//   - news     : Neon NewsItem (이미 로컬 DB, 무료)
//   - company  : chaovietnam.co.kr xcd/v1 진출기업 (~3천)
//   - yellow   : 옐로페이지 마스터 JSON (~3.7천)
//   - magazine : WP REST posts (~5만, --mag-limit 로 부분 색인 가능)
//
// 각 소스는 "전체 재색인" 방식: 해당 type 행을 지우고 새로 createMany.
// (멱등 — 몇 번 돌려도 결과 동일. 증분은 후속 과제.)
//
// 사용:
//   node scripts/build-search-index.js                 # 전 소스 (magazine 전량)
//   node scripts/build-search-index.js news company yellow   # 특정 소스만
//   node scripts/build-search-index.js --mag-limit=500       # magazine 500개만 (테스트/첫 마일스톤)
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { reapplyAllEdits } = require('../lib/apply-directory-edits');

const prisma = new PrismaClient();

const WP_URL = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
const WP_USER = process.env.WORDPRESS_USERNAME || 'chaovietnam';
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const XCD_BASE = `${WP_URL}/wp-json/xcd/v1`;
const YELLOW_JSON = 'C:/chao-vn-app/chao-vn-app/.tmp/yellowpage/out/yellowpage_master.json';

// ---- 공통 유틸 ----
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stripHtml = s => String(s || '').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
const lc = s => String(s || '').toLowerCase();
const md5 = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 16);

async function fetchJson(url, opts = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res.json();
      if (i === retries) throw new Error(`HTTP ${res.status} ${url}`);
    } catch (e) { if (i === retries) throw e; }
    await sleep(1000 * (i + 1));
  }
}

// type 행 전부 지우고 새로 적재 (청크 createMany)
async function replaceType(type, records) {
  await prisma.searchIndex.deleteMany({ where: { type } });
  let n = 0;
  for (let i = 0; i < records.length; i += 1000) {
    const chunk = records.slice(i, i + 1000);
    const r = await prisma.searchIndex.createMany({ data: chunk, skipDuplicates: true });
    n += r.count;
  }
  console.log(`  ✅ ${type}: ${n}건 적재`);
  return n;
}

const DAILY_NEWS_CAT = 31; // WP 데일리뉴스 카테고리

// WP REST posts 페이지네이션 수집 공통 (extraQS 예: 'categories=31' / 'categories_exclude=31')
async function fetchWpPosts(extraQS, limit) {
  if (!WP_PASSWORD) { console.log('  ⚠️ WORDPRESS_APP_PASSWORD 없음, 건너뜀'); return null; }
  const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
  const per_page = 100;
  let page = 1, all = [];
  while (true) {
    const posts = await fetchJson(
      `${WP_URL}/wp-json/wp/v2/posts?per_page=${per_page}&page=${page}&${extraQS}&_fields=id,link,date,title,excerpt`,
      { headers: { Authorization: `Basic ${auth}` } });
    if (!Array.isArray(posts) || posts.length === 0) break;
    all = all.concat(posts);
    if (limit && all.length >= limit) { all = all.slice(0, limit); break; }
    if (posts.length < per_page) break;
    page++;
    await sleep(150);
  }
  return all;
}

function wpToRecord(p, type) {
  const title = stripHtml(p.title && p.title.rendered);
  const summary = stripHtml(p.excerpt && p.excerpt.rendered);
  return {
    id: `${type}:${p.id}`, type,
    title: title || '(제목없음)', summary: summary || null,
    url: p.link || null,                 // 우리 WordPress — 외부링크 OK
    phone: null, address: null,
    searchText: lc(`${title} ${summary}`),
    city: null, district: null, category: null,
    lat: null, lng: null, priority: 0,
    publishedAt: p.date ? new Date(p.date) : null,
  };
}

// ---- 어댑터: 뉴스 (WP 데일리뉴스 카테고리 = 6년 전체 아카이브, ~18k) ----
// Neon NewsItem 은 최근 일부만 보관(staging) → 공개 아카이브 전량은 WP 가 원본.
async function buildNews(limit) {
  console.log(`📰 news: WP 데일리뉴스(cat ${DAILY_NEWS_CAT}) 수집 중${limit ? ` (최대 ${limit})` : ' (전량)'}...`);
  const posts = await fetchWpPosts(`categories=${DAILY_NEWS_CAT}`, limit);
  if (posts === null) return 0;
  return replaceType('news', posts.map(p => wpToRecord(p, 'news')));
}

// 지역 정규화 — 진출기업(영문 省名)·옐로(한글) 를 한글 정규 체계로 통일.
// 베트남어 발음부호 제거 후 매칭하므로 HỒ CHÍ MINH = HO CHI MINH 같은 변형도 흡수.
const deAccent = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const CITY_KO = {
  'HANOI': '하노이', 'HCMC': '호치민', 'HCM': '호치민', 'HO CHI MINH': '호치민', 'SAIGON': '호치민',
  'BAC NINH': '박닌', 'BINH DUONG': '빈증', 'DONG NAI': '동나이', 'HAI PHONG': '하이퐁',
  'BAC GIANG': '박장', 'LONG AN': '롱안', 'VINH PHUC': '빈푹', 'DA NANG': '다낭',
  'HA NAM': '하남', 'PHU THO': '푸토', 'HAI DUONG': '하이즈엉', 'HUNG YEN': '흥옌',
  'THAI NGUYEN': '타이응우옌', 'BA RIA-VUNG TAU': '붕따우', 'BA RIA - VUNG TAU': '붕따우', 'VUNG TAU': '붕따우',
  'QUANG NAM': '꽝남', 'TAY NINH': '떠이닌', 'BINH PHUOC': '빈프억', 'CAN THO': '껀터',
  'NHA TRANG': '나트랑', 'KHANH HOA': '나트랑', 'THANH HOA': '타인호아', 'NINH BINH': '닌빈',
  'NAM DINH': '남딘', 'THAI BINH': '타이빈', 'NGHE AN': '응에안', 'TIEN GIANG': '띠엔장',
  'QUANG NINH': '꽝닌', 'HOA BINH': '호아빈', 'LAM DONG': '럼동', 'TRA VINH': '짜빈',
  'BEN TRE': '벤째', 'VINH LONG': '빈롱', 'HUE': '후에', 'THUA THIEN HUE': '후에',
  'BINH THUAN': '빈투언', 'TUYEN QUANG': '뚜옌꽝', 'DAK LAK': '닥락', 'KIEN GIANG': '끼엔장',
  'AN GIANG': '안장', 'QUANG NGAI': '꽝응아이', 'SON LA': '선라', 'QUANG BINH': '꽝빈',
  'KON TUM': '꼰뚬', 'BAC LIEU': '박리에우', 'HA TINH': '하띤', 'LAO CAI': '라오까이',
  'DAK NONG': '닥농', 'YEN BAI': '옌바이', 'SOC TRANG': '속짱', 'BAC HANOI': '하노이',
};
const KO_CITIES = new Set(Object.values(CITY_KO));
function normalizeCity(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/\(.*?\)/g, ' ').trim();   // 괄호 주석 제거
  if (!s) return null;
  if (/[가-힣]/.test(s)) {                                // 한글 입력(주로 옐로)
    if (s === '미상' || s === '불명') return null;
    if (s.startsWith('기타')) return '기타';
    s = s.replace(/코참.*$/, '').trim();
    if (KO_CITIES.has(s)) return s;
    return s.length <= 6 ? s : null;                      // 긴 한글은 잡음(업종 오기입 등)으로 간주
  }
  const a = deAccent(s).toUpperCase().replace(/\s+KORCHAM.*$/, '').replace(/\s+/g, ' ').trim();
  if (a.includes('KOREA')) return null;                   // 본사 한국 = 베트남 지역 아님
  if (a.startsWith('OTHER') || a === 'ETC') return '기타';
  return CITY_KO[a] || null;                              // 미지 영문 → null (searchText 로는 여전히 검색됨)
}
// 구군 정리 — 호치민 군 번호는 1~12 만 유효, 그 외(51군·13군)는 OCR 오류로 제거
function cleanDistrict(d) {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d+)\s*군$/);
  if (m && (+m[1] < 1 || +m[1] > 12)) return null;
  return String(d).trim() || null;
}

// ---- 어댑터: 진출기업 (xcd/v1) ----
async function buildCompany() {
  console.log('🏢 company: xcd/v1 수집 중...');
  const per_page = 100;
  let page = 1, all = [];
  while (true) {
    const data = await fetchJson(`${XCD_BASE}/list?page=${page}&per_page=${per_page}`,
      { headers: { Accept: 'application/json' } });
    const items = (data && data.items) || [];
    all = all.concat(items);
    const totalPages = (data && data.total_pages) || 1;
    if (page >= totalPages || items.length === 0) break;
    page++;
    await sleep(200);
  }
  const records = all.map(c => {
    const name = c.company || c.name || '';
    const koCity = normalizeCity(c.area);
    // 검색엔 한글 도시명 + 영문 원문 둘 다 넣어 어느 쪽으로 쳐도 잡히게
    const parts = [name, c.director, c.industry_group, c.industry_detail, c.area, koCity,
      c.address, c.products, c.search_text].filter(Boolean).join(' ');
    return {
      id: `company:${c.id}`, type: 'company',
      title: name,
      summary: [c.industry_group, koCity, c.address].filter(Boolean).join(' · ') || null,
      // 외부 디렉토리(source_url)는 절대 링크하지 않음. 자사 홈페이지만 보존(상세페이지 내 버튼용)
      url: c.homepage || null,
      phone: c.tel || c.mobile || null,
      address: c.address || null,
      searchText: lc(parts),
      city: koCity, district: null,
      category: c.industry_group || null,
      lat: null, lng: null, priority: 0,
      publishedAt: null,
    };
  });
  return replaceType('company', records);
}

// ---- 어댑터: 옐로페이지 (마스터 JSON) ----
async function buildYellow() {
  console.log('📒 yellow: 마스터 JSON 읽는 중...');
  if (!fs.existsSync(YELLOW_JSON)) { console.log('  ⚠️ JSON 없음, 건너뜀:', YELLOW_JSON); return 0; }
  const list = JSON.parse(fs.readFileSync(YELLOW_JSON, 'utf8'));
  const seen = new Set();
  const records = [];
  for (const y of list) {
    if (!y.name || !String(y.name).trim()) continue;   // 이름 없는 업소는 검색 무의미 → 제외
    const phones = Array.isArray(y.phones) ? y.phones : (y.phones ? [y.phones] : []);
    const key = md5(`${y.name || ''}|${phones[0] || ''}|${y.address || ''}`);
    const id = `yellow:${key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const parts = [y.name, y.name_en, y.contact_person, ...phones, y.address,
      y.category, y.city, y.district, y.extra].filter(Boolean).join(' ');
    records.push({
      id, type: 'yellow',
      title: y.name || '(이름없음)',
      summary: [y.category, [y.city, y.district].filter(Boolean).join(' '), y.address]
        .filter(Boolean).join(' · ') || null,
      // 라이프플라자 등 외부 출처 링크 금지(자해). 항상 내부 상세페이지로.
      url: null,
      phone: phones.join(' / ') || null,
      address: y.address || null,
      searchText: lc(parts),
      city: normalizeCity(y.city), district: cleanDistrict(y.district),
      category: y.appCategory || y.category || null,
      lat: typeof y.lat === 'number' ? y.lat : null,
      lng: typeof y.lng === 'number' ? y.lng : null,
      // 자체 검증(own) 우선 노출
      priority: y.source === 'own' ? 10 : 0,
      publishedAt: null,
    });
  }
  return replaceType('yellow', records);
}

// ---- 어댑터: 매거진 (WP posts, 데일리뉴스 카테고리 제외 = 매거진·교민 콘텐츠 ~7k) ----
async function buildMagazine(limit) {
  console.log(`📚 magazine: WP posts(cat≠${DAILY_NEWS_CAT}) 수집 중${limit ? ` (최대 ${limit})` : ' (전량)'}...`);
  const posts = await fetchWpPosts(`categories_exclude=${DAILY_NEWS_CAT}`, limit);
  if (posts === null) return 0;
  return replaceType('magazine', posts.map(p => wpToRecord(p, 'magazine')));
}

async function main() {
  const args = process.argv.slice(2);
  const magLimitArg = args.find(a => a.startsWith('--mag-limit='));
  const magLimit = magLimitArg ? parseInt(magLimitArg.split('=')[1], 10) : 0;
  const sources = args.filter(a => !a.startsWith('--'));
  const run = s => sources.length === 0 || sources.includes(s);

  console.log('🔎 통합검색 색인 빌드 시작');
  const t0 = Date.now();
  const summary = {};
  try {
    if (run('news')) summary.news = await buildNews(magLimit);
    if (run('company')) summary.company = await buildCompany();
    if (run('yellow')) summary.yellow = await buildYellow();
    if (run('magazine')) summary.magazine = await buildMagazine(magLimit);
    // 재색인으로 덮인 행에 관리자 수정 다시 반영
    summary.editsReapplied = await reapplyAllEdits(prisma);
  } catch (e) {
    console.error('❌ 실패:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
  console.log('────────────────────────────');
  console.log('합계:', summary, `(${Math.round((Date.now() - t0) / 1000)}s)`);
}

main();
