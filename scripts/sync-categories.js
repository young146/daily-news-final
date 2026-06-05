// 구독자 category 동기화/백필 — 고객/일반/기업디렉토리 분류를 DB에 반영
//   customer  = Google CRM 시트 ∪ 통합 광고주  (isCustomer=true 로도 동기화)
//   directory = WordPress 기업디렉토리에 이메일 매칭 (비고객)
//   general   = 나머지
//   우선순위 customer > directory > general
//
// 기업디렉토리는 WP가 원천 → 변동 반영하려면 이 스크립트를 다시 실행하면 됨.
//
// 사용:
//   node scripts/sync-categories.js            # dry-run (변경 없음)
//   node scripts/sync-categories.js --execute  # 실제 반영

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env', override: false });

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');
const SHEET = '1Iue5sV2PE3c6rqLuVozrp14JiKciGyKvbP8bJheqWlA';
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const norm = (e) => (e || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
const BATCH = 500;

function parseCSV(t) {
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const R = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); R.push(r); r = []; c = ''; } else if (ch === '\r') {} else c += ch; }
  }
  if (c || r.length) { r.push(c); R.push(r); }
  return R;
}
async function fetchSheetTab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}&v=${Date.now()}`;
  return parseCSV(await (await fetch(url, { cache: 'no-store' })).text());
}
async function fetchDirectory() {
  const base = (process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr') + '/wp-json';
  const tok = Buffer.from(`${process.env.WORDPRESS_USERNAME}:${process.env.WORDPRESS_APP_PASSWORD}`).toString('base64');
  const emails = new Set(); let page = 1, totalPages = 1;
  do {
    const res = await fetch(`${base}/xcd/v1/search?per_page=100&page=${page}`, { headers: { Authorization: 'Basic ' + tok }, cache: 'no-store' });
    if (!res.ok) throw new Error('WP HTTP ' + res.status);
    const d = await res.json();
    for (const co of (d.items || [])) {
      [co.email, ...String(co.additional_emails || '').split(/[;,\s]+/)].forEach(x => { const e = norm(x); if (EMAIL_RE.test(e)) emails.add(e); });
    }
    totalPages = d.total_pages || 1; page++;
  } while (page <= totalPages);
  return emails;
}
async function withRetry(fn) { for (let a = 0; a < 6; a++) { try { return await fn(); } catch (e) { if (a === 5) throw e; await new Promise(r => setTimeout(r, 2500)); } } }

async function main() {
  console.log('='.repeat(58));
  console.log(`  구독자 category 동기화 ${EXECUTE ? '[실제 반영]' : '[DRY-RUN]'}`);
  console.log('='.repeat(58));
  console.log('  데이터 수집 중...');

  // 고객 집합 = CRM 시트 ∪ 통합 광고주
  const [custTab, consTab] = await Promise.all([fetchSheetTab('고객DB'), fetchSheetTab('상담이력')]);
  const customerSet = new Set();
  for (const r of custTab) { const e = norm(r[4]); if (EMAIL_RE.test(e)) customerSet.add(e); }
  for (let i = 1; i < consTab.length; i++) { const e = norm(consTab[i][6]); if (EMAIL_RE.test(e)) customerSet.add(e); }
  const acPath = path.join('.tmp', 'merge', 'all_classified.csv');
  if (fs.existsSync(acPath)) {
    const rows = parseCSV(fs.readFileSync(acPath, 'utf-8'));
    const h = rows[0].map(s => s.trim()); const ei = h.indexOf('email'), ui = h.indexOf('isCustomer');
    for (let i = 1; i < rows.length; i++) { if ((rows[i][ui] || '').trim() === 'true') { const e = norm(rows[i][ei]); if (EMAIL_RE.test(e)) customerSet.add(e); } }
  }
  const dirEmails = await fetchDirectory();
  console.log(`  고객 집합 ${customerSet.size} · 디렉토리 이메일 ${dirEmails.size}`);

  // DB 분류 결정
  const subs = await withRetry(() => prisma.subscriber.findMany({ select: { email: true, category: true, isCustomer: true } }));
  const want = { customer: [], directory: [], general: [] };
  let changedCat = 0, changedCust = 0;
  for (const s of subs) {
    const e = s.email.toLowerCase();
    const cat = customerSet.has(e) ? 'customer' : dirEmails.has(e) ? 'directory' : 'general';
    want[cat].push(s.email);
    if (s.category !== cat) changedCat++;
    const wantCust = cat === 'customer';
    if (s.isCustomer !== wantCust) changedCust++;
  }
  console.log('-'.repeat(58));
  console.log(`  분류 결과: 고객 ${want.customer.length} · 기업디렉토리 ${want.directory.length} · 일반 ${want.general.length}`);
  console.log(`  변경: category ${changedCat}건, isCustomer ${changedCust}건`);

  if (!EXECUTE) { console.log('\n  [DRY-RUN] 변경 없음. 적용하려면 --execute.'); return; }

  const apply = async (emails, category, isCustomer) => {
    for (let i = 0; i < emails.length; i += BATCH) {
      const chunk = emails.slice(i, i + BATCH);
      await prisma.subscriber.updateMany({ where: { email: { in: chunk } }, data: { category, isCustomer } });
    }
  };
  await apply(want.customer, 'customer', true);
  await apply(want.directory, 'directory', false);
  await apply(want.general, 'general', false);
  console.log('\n  ✓ 반영 완료.');
  const byCat = await prisma.subscriber.groupBy({ by: ['category'], _count: true });
  console.log('  DB 현재 분류:', byCat.map(c => `${c.category} ${c._count}`).join(' · '));
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); }).finally(async () => await prisma.$disconnect());
