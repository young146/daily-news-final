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
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const core = require('../lib/search-index-core');
const { reapplyAllEdits } = require('../lib/apply-directory-edits');

const prisma = new PrismaClient();
// 영구 위치(레포에 커밋·GitHub 백업·서버 배포 포함). 서버 크론도 같은 파일을 import 로 사용.
const YELLOW_JSON = path.join(__dirname, '..', 'data', 'yellowpage_master.json');

// 옐로페이지 = 이웃업소(프리미엄) + 매거진/라이프플라자(JSON) 병합 — 로직은 core 공용
async function buildYellow() {
  let list = [];
  if (fs.existsSync(YELLOW_JSON)) list = JSON.parse(fs.readFileSync(YELLOW_JSON, 'utf8'));
  else console.log('  ⚠️ 마스터 JSON 없음:', YELLOW_JSON);
  const r = await core.buildYellow(prisma, list);
  console.log(`  ✅ yellow: ${r.total}건 (이웃업소 ${r.neighbor} / 중복제외 ${r.dedupSkipped})`);
  return r.total;
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
