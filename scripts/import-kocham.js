// 코참 신규 추가 가능 이메일을 DB에 직접 import (Vercel API 우회)
//
// 사용:
//   node scripts/import-kocham.js                  # dry-run (insert 안 함)
//   node scripts/import-kocham.js --execute        # 실제 import
//   node scripts/import-kocham.js --execute --file kocham_addable.csv  # 파일 지정

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const fileIdx = args.indexOf('--file');
const FILE = fileIdx >= 0 ? args[fileIdx + 1] : 'kocham_addable.csv';
const BATCH = 500;

function parseCsv(text) {
  // utf-8-sig BOM 제거
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let cur = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else field += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
        cur = []; field = '';
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else field += c;
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows;
}

async function main() {
  console.log('='.repeat(60));
  console.log(`  코참 이메일 DB 직접 import ${EXECUTE ? '[실제 실행]' : '[DRY-RUN]'}`);
  console.log('='.repeat(60));
  console.log(`  파일: ${FILE}`);

  if (!fs.existsSync(FILE)) {
    console.error(`  파일 없음: ${FILE}`);
    process.exit(1);
  }

  const text = fs.readFileSync(FILE, 'utf-8');
  const csvRows = parseCsv(text);
  const header = csvRows[0].map(h => h.trim());
  const idx = (col) => header.indexOf(col);

  const emailCol = idx('email');
  const companyCol = idx('company');
  const directorCol = idx('director');
  if (emailCol < 0) {
    console.error(`  email 컬럼 없음. 헤더: ${header.join(', ')}`);
    process.exit(1);
  }

  // CSV → 후보 레코드
  const candidates = [];
  const seen = new Set();
  let skippedInvalid = 0, skippedDup = 0;
  for (let i = 1; i < csvRows.length; i++) {
    const r = csvRows[i];
    if (!r || r.length === 0) continue;
    const email = (r[emailCol] || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { skippedInvalid++; continue; }
    if (seen.has(email)) { skippedDup++; continue; }
    seen.add(email);
    candidates.push({
      email,
      company: companyCol >= 0 ? (r[companyCol] || '').trim().slice(0, 200) : null,
      name: directorCol >= 0 ? (r[directorCol] || '').trim().slice(0, 100) : null,
      phone: null,
      isActive: true,
    });
  }
  console.log(`  CSV 파싱: ${candidates.length}건 후보 (잘못된 이메일 ${skippedInvalid} / 파일 내 중복 ${skippedDup} 제외)`);

  // DB에 이미 존재하는 이메일 체크 (안전장치 - kocham_addable.csv는 이미 필터됐지만)
  const existing = await prisma.subscriber.findMany({
    where: { email: { in: candidates.map(c => c.email) } },
    select: { email: true },
  });
  const existingSet = new Set(existing.map(e => e.email.toLowerCase()));
  const toInsert = candidates.filter(c => !existingSet.has(c.email));
  console.log(`  DB 중복 검사: ${existing.length}건이 이미 존재 → 건너뜀`);
  console.log(`  실제 insert 대상: ${toInsert.length}건`);

  if (toInsert.length === 0) {
    console.log('  insert할 항목 없음.');
    return;
  }

  // 샘플 5건 미리보기
  console.log('\n  샘플 5건:');
  for (const s of toInsert.slice(0, 5)) {
    const co = (s.company || '').slice(0, 35);
    console.log(`    ${s.email.padEnd(40)} | ${co}`);
  }

  if (!EXECUTE) {
    console.log('\n  [DRY-RUN] 실제 적용 안 함. 적용하려면 --execute 추가.');
    return;
  }

  // 배치로 createMany
  console.log(`\n  createMany 배치 시작 (배치 크기 ${BATCH})...`);
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const result = await prisma.subscriber.createMany({
      data: chunk,
      skipDuplicates: true,  // race 조건 안전장치
    });
    inserted += result.count;
    console.log(`    [${i + chunk.length}/${toInsert.length}] +${result.count}건 (누적 ${inserted})`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`  ✓ 완료: ${inserted}건 신규 추가됨`);
  console.log('='.repeat(60));
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());
