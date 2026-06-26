// 통합검색 색인 빌더 — 공용 코어 (CLI + Vercel 크론/엔드포인트 공용)
// prisma 인스턴스를 인자로 받아 동작. CommonJS.
const crypto = require('crypto');

const WP_URL = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
const WP_USER = process.env.WORDPRESS_USERNAME || 'chaovietnam';
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const XCD_BASE = `${WP_URL}/wp-json/xcd/v1`;
const DAILY_NEWS_CAT = 31;

// ---- 공통 유틸 ----
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stripHtml = s => String(s || '').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
const lc = s => String(s || '').toLowerCase();
const md5 = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 16);
const phoneKey = p => { let d = String(p || '').split(/[/,;~]/)[0].replace(/[^0-9]/g, ''); if (d.startsWith('84')) d = d.slice(2); d = d.replace(/^0+/, ''); return d.length >= 8 ? d : ''; };
const nameKey = s => String(s || '').replace(/\([^)]*\)/g, '').replace(/[\s.,'"·\-_/]/g, '').toLowerCase();

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

// type 행 전부 지우고 새로 적재
async function replaceType(prisma, type, records) {
  await prisma.searchIndex.deleteMany({ where: { type } });
  let n = 0;
  for (let i = 0; i < records.length; i += 1000) {
    const r = await prisma.searchIndex.createMany({ data: records.slice(i, i + 1000), skipDuplicates: true });
    n += r.count;
  }
  return n;
}

// ---- 지역 정규화 ----
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
  let s = String(raw).replace(/\(.*?\)/g, ' ').trim();
  if (!s) return null;
  if (/[가-힣]/.test(s)) {
    if (s === '미상' || s === '불명') return null;
    if (s.startsWith('기타')) return '기타';
    s = s.replace(/코참.*$/, '').trim();
    if (KO_CITIES.has(s)) return s;
    return s.length <= 6 ? s : null;
  }
  const a = deAccent(s).toUpperCase().replace(/\s+KORCHAM.*$/, '').replace(/\s+/g, ' ').trim();
  if (a.includes('KOREA')) return null;
  if (a.startsWith('OTHER') || a === 'ETC') return '기타';
  return CITY_KO[a] || null;
}
function cleanDistrict(d) {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d+)\s*군$/);
  if (m && (+m[1] < 1 || +m[1] > 12)) return null;
  return String(d).trim() || null;
}

// ---- WP posts (뉴스/매거진) ----
async function fetchWpPosts(extraQS, limit) {
  if (!WP_PASSWORD) return null;
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
    url: p.link || null, phone: null, address: null, imageUrl: null,
    searchText: lc(`${title} ${summary}`),
    city: null, district: null, category: null,
    lat: null, lng: null, priority: 0,
    publishedAt: p.date ? new Date(p.date) : null,
  };
}
async function buildNews(prisma, limit) {
  const posts = await fetchWpPosts(`categories=${DAILY_NEWS_CAT}`, limit);
  if (posts === null) return 0;
  return replaceType(prisma, 'news', posts.map(p => wpToRecord(p, 'news')));
}
async function buildMagazine(prisma, limit) {
  const posts = await fetchWpPosts(`categories_exclude=${DAILY_NEWS_CAT}`, limit);
  if (posts === null) return 0;
  return replaceType(prisma, 'magazine', posts.map(p => wpToRecord(p, 'magazine')));
}

// ---- 진출기업 (xcd/v1) ----
async function buildCompany(prisma) {
  const per_page = 100;
  let page = 1, all = [];
  while (true) {
    const data = await fetchJson(`${XCD_BASE}/list?page=${page}&per_page=${per_page}`, { headers: { Accept: 'application/json' } });
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
    const parts = [name, c.director, c.industry_group, c.industry_detail, c.area, koCity, c.address, c.products, c.search_text].filter(Boolean).join(' ');
    return {
      id: `company:${c.id}`, type: 'company', title: name,
      summary: [c.industry_group, koCity, c.address].filter(Boolean).join(' · ') || null,
      url: c.homepage || null, phone: c.tel || c.mobile || null, address: c.address || null, imageUrl: null,
      searchText: lc(parts), city: koCity, district: null, category: c.industry_group || null,
      lat: null, lng: null, priority: 0, publishedAt: null,
    };
  });
  return replaceType(prisma, 'company', records);
}

// ---- 이웃업소 (Firestore 공개 읽기) ----
async function fetchNeighbor() {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getFirestore, collection, getDocs, query, where } = await import('firebase/firestore');
  const cfg = { apiKey: 'AIzaSyAAtT9gcu8eVQIhQxYEgBTGp2XZ6ghz_NU', authDomain: 'chaovietnam-login.firebaseapp.com',
    projectId: 'chaovietnam-login', storageBucket: 'chaovietnam-login.firebasestorage.app',
    messagingSenderId: '249390849714', appId: '1:249390849714:web:34c894772258dad5e973ab' };
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  const db = getFirestore(app);
  const snap = await getDocs(query(collection(db, 'NeighborBusinesses'), where('active', '==', true)));
  const out = [];
  snap.forEach(d => { const x = d.data(); if (x.approvalStatus && x.approvalStatus !== 'approved') return; out.push({ id: d.id, ...x }); });
  return out;
}
function neighborToRecord(n) {
  const phone = (n.contacts && n.contacts.phone) || '';
  const imgs = Array.isArray(n.images) ? n.images : [];
  const thumb = imgs[n.thumbnailIndex || 0] || imgs[0] || null;
  const loc = n.location || {};
  const parts = [n.name, n.description, n.category, n.city, n.district, n.address, phone, ...(n.tags || [])].filter(Boolean).join(' ');
  return {
    id: `neighbor:${n.id}`, type: 'yellow', title: n.name || '(이름없음)',
    summary: [n.category, [n.city, n.district].filter(Boolean).join(' '), n.address].filter(Boolean).join(' · ') || null,
    url: (n.contacts && n.contacts.website) || n.externalLink || null,
    phone: phone || null, address: n.address || null, imageUrl: thumb,
    searchText: lc(parts), city: normalizeCity(n.city), district: cleanDistrict(n.district),
    category: n.category || null,
    lat: typeof loc.lat === 'number' ? loc.lat : null, lng: typeof loc.lng === 'number' ? loc.lng : null,
    priority: 100 + (Number(n.priority) || 0), publishedAt: null,
  };
}

// 이웃업소만 외과적 갱신 (Vercel/승인 즉시용) — neighbor:* 교체 + 중복 yellow:* 제거.
// 옐로 JSON(로컬)은 건드리지 않음.
async function refreshNeighbor(prisma) {
  const neighbor = await fetchNeighbor();
  const nKeys = new Set();
  const records = neighbor.map(n => {
    const pk = phoneKey((n.contacts && n.contacts.phone) || ''); if (pk) nKeys.add('p:' + pk);
    const nk = nameKey(n.name); if (nk) nKeys.add('n:' + nk);
    return neighborToRecord(n);
  });
  await prisma.searchIndex.deleteMany({ where: { id: { startsWith: 'neighbor:' } } });
  for (let i = 0; i < records.length; i += 1000) {
    await prisma.searchIndex.createMany({ data: records.slice(i, i + 1000), skipDuplicates: true });
  }
  // 사진 있는 이웃업소가 이기도록, 중복되는 일반 옐로(yellow:*) 제거
  const yrows = await prisma.searchIndex.findMany({ where: { id: { startsWith: 'yellow:' } }, select: { id: true, phone: true, title: true } });
  const delIds = yrows.filter(r =>
    (r.phone && String(r.phone).split(' / ').some(p => nKeys.has('p:' + phoneKey(p)))) || nKeys.has('n:' + nameKey(r.title))
  ).map(r => r.id);
  if (delIds.length) await prisma.searchIndex.deleteMany({ where: { id: { in: delIds } } });
  return { neighbor: records.length, dedupRemoved: delIds.length };
}

module.exports = {
  // helpers
  sleep, stripHtml, lc, md5, phoneKey, nameKey, normalizeCity, cleanDistrict, replaceType,
  // builders
  buildNews, buildMagazine, buildCompany, fetchNeighbor, neighborToRecord, refreshNeighbor,
};
