// ============================================================
// 통합검색 색인 빌더 (CLI) — 로컬 전체 재색인.
// 공용 로직은 lib/search-index-core.js. 여기선 옐로페이지(로컬 JSON) 병합 + CLI 진입점만.
//
// 사용:
//   node scripts/build-search-index.js                      # 전 소스 (magazine 전량)
//   node scripts/build-search-index.js news company yellow  # 특정 소스만
//   node scripts/build-search-index.js --mag-limit=500      # magazine 일부(테스트)
// ============================================================
require('dotenv').config();
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const core = require('../lib/search-index-core');
const { reapplyAllEdits } = require('../lib/apply-directory-edits');

const prisma = new PrismaClient();
const YELLOW_JSON = 'C:/chao-vn-app/chao-vn-app/.tmp/yellowpage/out/yellowpage_master.json';

// 옐로페이지 = 이웃업소(프리미엄) + 매거진/라이프플라자 마스터 JSON 병합 (로컬 전용 — JSON 이 로컬 파일)
async function buildYellow() {
  let neighbor = [];
  try { neighbor = await core.fetchNeighbor(); } catch (e) { console.log('  ⚠️ 이웃업소 읽기 실패:', e.message); }
  console.log(`📍 이웃업소(프리미엄): ${neighbor.length}곳`);
  const nKeys = new Set();
  const neighborRecords = neighbor.map(n => {
    const pk = core.phoneKey((n.contacts && n.contacts.phone) || ''); if (pk) nKeys.add('p:' + pk);
    const nk = core.nameKey(n.name); if (nk) nKeys.add('n:' + nk);
    return core.neighborToRecord(n);
  });

  const yellowRecords = [];
  if (!fs.existsSync(YELLOW_JSON)) {
    console.log('  ⚠️ 마스터 JSON 없음:', YELLOW_JSON);
  } else {
    const list = JSON.parse(fs.readFileSync(YELLOW_JSON, 'utf8'));
    const seen = new Set();
    let skipped = 0;
    for (const y of list) {
      if (!y.name || !String(y.name).trim()) continue;
      const phones = Array.isArray(y.phones) ? y.phones : (y.phones ? [y.phones] : []);
      const dup = phones.some(p => nKeys.has('p:' + core.phoneKey(p))) || nKeys.has('n:' + core.nameKey(y.name));
      if (dup) { skipped++; continue; }
      const id = `yellow:${core.md5(`${y.name || ''}|${phones[0] || ''}|${y.address || ''}`)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const parts = [y.name, y.name_en, y.contact_person, ...phones, y.address, y.category, y.city, y.district, y.extra].filter(Boolean).join(' ');
      yellowRecords.push({
        id, type: 'yellow', title: y.name || '(이름없음)',
        summary: [y.category, [y.city, y.district].filter(Boolean).join(' '), y.address].filter(Boolean).join(' · ') || null,
        url: null, phone: phones.join(' / ') || null, address: y.address || null, imageUrl: null,
        searchText: core.lc(parts), city: core.normalizeCity(y.city), district: core.cleanDistrict(y.district),
        category: y.appCategory || y.category || null,
        lat: typeof y.lat === 'number' ? y.lat : null, lng: typeof y.lng === 'number' ? y.lng : null,
        priority: y.source === 'own' ? 10 : 0, publishedAt: null,
      });
    }
    if (skipped) console.log(`  ↳ 이웃업소와 중복 ${skipped}건 제외`);
  }
  const n = await core.replaceType(prisma, 'yellow', [...neighborRecords, ...yellowRecords]);
  console.log(`  ✅ yellow: ${n}건 적재`);
  return n;
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
    if (run('news')) { console.log('📰 news...'); summary.news = await core.buildNews(prisma, magLimit); console.log(`  ✅ news: ${summary.news}`); }
    if (run('company')) { console.log('🏢 company...'); summary.company = await core.buildCompany(prisma); console.log(`  ✅ company: ${summary.company}`); }
    if (run('yellow')) summary.yellow = await buildYellow();
    if (run('magazine')) { console.log('📚 magazine...'); summary.magazine = await core.buildMagazine(prisma, magLimit); console.log(`  ✅ magazine: ${summary.magazine}`); }
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
