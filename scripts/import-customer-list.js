// 고객 통합 리스트를 구독자 DB와 동기화 (라이브 DB 기준)
//  ⓪ bounced-list.txt 대조 — 과거 바운스/삭제 이메일은 후보에서 제외 (active 부활 방지)
//  ① 신규 이메일 INSERT (광고주→isCustomer=true, 개인회원→false)
//  ② 이미 존재하지만 광고주인데 isCustomer=false인 항목 → true로 UPGRADE
// isActive(활성/비활성)는 절대 건드리지 않음 — 바운스/수신거부 보존.
//
// 사용:
//   node scripts/import-customer-list.js              # dry-run (변경 없음)
//   node scripts/import-customer-list.js --execute    # 실제 적용
//
// 입력: .tmp/merge/all_classified.csv  (merge-customer-list.py 생성)
//   헤더: email,company,name,phone,isCustomer

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const fileIdx = args.indexOf('--file');
const FILE = fileIdx >= 0 ? args[fileIdx + 1] : path.join('.tmp', 'merge', 'all_classified.csv');
const BATCH = 500;

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let cur = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuote = false; }
      else field += c;
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
  console.log(`  고객 통합 리스트 동기화 ${EXECUTE ? '[실제 실행]' : '[DRY-RUN]'}`);
  console.log('='.repeat(60));
  console.log(`  파일: ${FILE}`);
  if (!fs.existsSync(FILE)) { console.error(`  파일 없음: ${FILE} — 먼저 merge-customer-list.py 실행`); process.exit(1); }

  const csvRows = parseCsv(fs.readFileSync(FILE, 'utf-8'));
  const header = csvRows[0].map(h => h.trim());
  const idx = (c) => header.indexOf(c);
  const eC = idx('email'), coC = idx('company'), nC = idx('name'), phC = idx('phone'), cuC = idx('isCustomer');

  const cand = new Map();
  let invalid = 0, dup = 0;
  for (let i = 1; i < csvRows.length; i++) {
    const r = csvRows[i]; if (!r || r.length === 0) continue;
    const email = (r[eC] || '').trim().toLowerCase();
    if (!email || !email.includes('@')) { invalid++; continue; }
    if (cand.has(email)) { dup++; continue; }
    cand.set(email, {
      email,
      company: coC >= 0 ? ((r[coC] || '').trim().slice(0, 200) || null) : null,
      name: nC >= 0 ? ((r[nC] || '').trim().slice(0, 100) || null) : null,
      phone: phC >= 0 ? ((r[phC] || '').trim().slice(0, 50) || null) : null,
      isCustomer: cuC >= 0 ? (r[cuC] || '').trim().toLowerCase() === 'true' : false,
    });
  }
  console.log(`  리스트: ${cand.size}건 (무효 ${invalid} / 중복 ${dup} 제외)`);

  // 바운스 명단 대조 — 과거 바운스/삭제된 이메일이 active로 부활하는 것 방지
  let bounced = new Set();
  const blPath = path.join(__dirname, '..', 'bounced-list.txt');
  if (fs.existsSync(blPath)) {
    bounced = new Set(fs.readFileSync(blPath, 'utf-8').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean));
  }
  let skippedBounce = 0;
  for (const email of [...cand.keys()]) {
    if (bounced.has(email)) { cand.delete(email); skippedBounce++; }
  }
  console.log(`  바운스 대조(bounced-list.txt ${bounced.size}건): ${skippedBounce}건 제외 → 남은 후보 ${cand.size}`);

  const emails = [...cand.keys()];
  const db = await prisma.subscriber.findMany({
    where: { email: { in: emails } },
    select: { email: true, isCustomer: true, isActive: true },
  });
  const dbMap = new Map(db.map(d => [d.email.toLowerCase(), d]));

  const toInsert = [], toUpgrade = [];
  let okCust = 0, okIndiv = 0, inactive = 0;
  for (const [email, c] of cand) {
    const d = dbMap.get(email);
    if (!d) { toInsert.push({ ...c, isActive: true }); continue; }
    if (!d.isActive) inactive++;
    if (c.isCustomer && !d.isCustomer) toUpgrade.push(email);
    else if (c.isCustomer) okCust++;
    else okIndiv++;
  }
  const insCust = toInsert.filter(c => c.isCustomer).length;
  console.log('-'.repeat(60));
  console.log(`  ① 신규 INSERT      : ${toInsert.length}건 (고객 ${insCust} · 개인 ${toInsert.length - insCust})`);
  console.log(`  ② 고객 UPGRADE     : ${toUpgrade.length}건 (isCustomer false→true)`);
  console.log(`  이미 정확(고객)     : ${okCust}`);
  console.log(`  개인회원(기존)      : ${okIndiv}`);
  console.log(`  (참고) 기존 비활성  : ${inactive}건 — 활성상태는 변경 안 함`);

  if (toInsert.length) {
    console.log('\n  INSERT 샘플 6건:');
    for (const s of toInsert.slice(0, 6))
      console.log(`    ${(s.isCustomer ? '[고객]' : '[개인]')} ${s.email.padEnd(36)} | ${(s.company || s.name || '').slice(0, 28)}`);
  }

  if (!EXECUTE) {
    console.log('\n  [DRY-RUN] 변경 없음. 적용하려면 --execute 추가.');
    return;
  }

  // ① INSERT
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const r = await prisma.subscriber.createMany({ data: chunk, skipDuplicates: true });
    inserted += r.count;
    console.log(`    [insert ${i + chunk.length}/${toInsert.length}] +${r.count} (누적 ${inserted})`);
  }
  // ② UPGRADE
  let upgraded = 0;
  for (let i = 0; i < toUpgrade.length; i += BATCH) {
    const chunk = toUpgrade.slice(i, i + BATCH);
    const r = await prisma.subscriber.updateMany({
      where: { email: { in: chunk }, isCustomer: false },
      data: { isCustomer: true },
    });
    upgraded += r.count;
    console.log(`    [upgrade ${i + chunk.length}/${toUpgrade.length}] ~${r.count} (누적 ${upgraded})`);
  }
  console.log('\n' + '='.repeat(60));
  console.log(`  ✓ 완료: 신규 ${inserted}건 추가 · 고객 ${upgraded}건 업그레이드`);
  console.log('='.repeat(60));
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());
