// 구독자/고객을 3개 리스트로 분류 정리 → .tmp/merge/lists/
//   ① customers.csv  (고객)        = Google CRM 시트 ∪ 통합 광고주
//   ② general.csv    (일반)        = 활성 구독자 중 고객·디렉토리 아닌 사람
//   ③ directory.csv  (기업 디렉토리) = WordPress 디렉토리 회사 + 구독자/고객 대조
//
// 우선순위: 고객 > 기업디렉토리 > 일반  (한 이메일이 여러 곳이면 위쪽으로 분류)
//
// 실행: node scripts/build-classified-lists.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env', override: false });

const prisma = new PrismaClient();
const SHEET = '1Iue5sV2PE3c6rqLuVozrp14JiKciGyKvbP8bJheqWlA';
const OUT = path.join('.tmp', 'merge', 'lists');
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const norm = (e) => (e || '').trim().replace(/^["']|["']$/g, '').toLowerCase();

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
const esc = (v) => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function writeCSV(file, header, rows) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), '﻿' + [header.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n'));
}

async function fetchSheetTab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}&v=${Date.now()}`;
  return parseCSV(await (await fetch(url, { cache: 'no-store' })).text());
}

async function fetchDirectory() {
  const base = (process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr') + '/wp-json';
  const tok = Buffer.from(`${process.env.WORDPRESS_USERNAME}:${process.env.WORDPRESS_APP_PASSWORD}`).toString('base64');
  const all = []; let page = 1, totalPages = 1;
  do {
    const res = await fetch(`${base}/xcd/v1/search?per_page=100&page=${page}`, { headers: { Authorization: 'Basic ' + tok }, cache: 'no-store' });
    if (!res.ok) throw new Error('WP HTTP ' + res.status);
    const d = await res.json();
    all.push(...(d.items || []));
    totalPages = d.total_pages || 1;
    page++;
  } while (page <= totalPages);
  return all;
}

async function withRetry(fn) { for (let a = 0; a < 6; a++) { try { return await fn(); } catch (e) { if (a === 5) throw e; await new Promise(r => setTimeout(r, 2500)); } } }

async function main() {
  console.log('데이터 수집 중...');
  // 1) Google CRM 시트
  const [custTab, consTab] = await Promise.all([fetchSheetTab('고객DB'), fetchSheetTab('상담이력')]);
  const crmSheet = new Set();
  for (const r of custTab) { const e = norm(r[4]); if (EMAIL_RE.test(e)) crmSheet.add(e); }
  for (let i = 1; i < consTab.length; i++) { const e = norm(consTab[i][6]); if (EMAIL_RE.test(e)) crmSheet.add(e); }

  // 2) 통합 광고주 (all_classified.csv 의 isCustomer=true)
  const adv = new Map();  // email -> {company,name,phone}
  const acPath = path.join('.tmp', 'merge', 'all_classified.csv');
  if (fs.existsSync(acPath)) {
    const rows = parseCSV(fs.readFileSync(acPath, 'utf-8'));
    const h = rows[0].map(s => s.trim());
    const ei = h.indexOf('email'), ci = h.indexOf('company'), ni = h.indexOf('name'), pi = h.indexOf('phone'), ui = h.indexOf('isCustomer');
    for (let i = 1; i < rows.length; i++) { const r = rows[i]; if ((r[ui] || '').trim() === 'true') { const e = norm(r[ei]); if (EMAIL_RE.test(e)) adv.set(e, { company: r[ci] || '', name: r[ni] || '', phone: r[pi] || '' }); } }
  }

  // 3) 바운스 명단 (제외 표시용)
  const bounced = new Set();
  const blp = path.join(__dirname, '..', 'bounced-list.txt');
  if (fs.existsSync(blp)) fs.readFileSync(blp, 'utf-8').split(/\r?\n/).forEach(l => { const e = norm(l); if (e) bounced.add(e); });

  // 4) WordPress 기업 디렉토리
  const dir = await fetchDirectory();
  const dirEmails = new Set();
  const dirRows = dir.map(co => {
    const emails = new Set();
    [co.email, ...(String(co.additional_emails || '').split(/[;,\s]+/))].forEach(x => { const e = norm(x); if (EMAIL_RE.test(e)) emails.add(e); });
    emails.forEach(e => dirEmails.add(e));
    return { co, emails: [...emails] };
  });

  // 5) DB 구독자 전체
  const subs = await withRetry(() => prisma.subscriber.findMany({ select: { email: true, company: true, name: true, phone: true, isActive: true, isCustomer: true } }));
  const subMap = new Map(subs.map(s => [s.email.toLowerCase(), s]));

  // ── 고객 집합 = CRM시트 ∪ 통합광고주
  const customerSet = new Set([...crmSheet, ...adv.keys()]);

  // ① 고객 리스트
  const custHeader = ['email', 'company', 'name', 'phone', 'source', 'in_db', 'is_active', 'is_bounced'];
  const custRows = [];
  for (const e of customerSet) {
    const inCrm = crmSheet.has(e), inAdv = adv.has(e);
    const src = inCrm && inAdv ? 'CRM+광고주' : inCrm ? 'CRM시트' : '광고주';
    const db = subMap.get(e); const a = adv.get(e);
    custRows.push([e, (db && db.company) || (a && a.company) || '', (db && db.name) || (a && a.name) || '', (db && db.phone) || (a && a.phone) || '', src, db ? 'Y' : 'N', db ? (db.isActive ? 'Y' : 'N') : '', bounced.has(e) ? 'Y' : '']);
  }
  custRows.sort((x, y) => x[4].localeCompare(y[4]) || x[0].localeCompare(y[0]));

  // ③ 기업 디렉토리 리스트 (구독자/고객 대조)
  const dirHeader = ['company', 'email', 'director', 'tel', 'mobile', 'area', 'industry_group', 'is_subscriber', 'is_customer', 'is_bounced'];
  const dirOut = dirRows.map(({ co, emails }) => {
    const primary = emails[0] || norm(co.email);
    const isSub = emails.some(e => subMap.has(e));
    const isCust = emails.some(e => customerSet.has(e));
    const isB = emails.some(e => bounced.has(e));
    return [co.company || '', primary || '', co.director || '', co.tel || '', co.mobile || '', co.area || '', co.industry_group || '', isSub ? 'Y' : 'N', isCust ? 'Y' : 'N', isB ? 'Y' : ''];
  });

  // ② 일반 리스트 = 활성 구독자 중 고객X · 디렉토리X
  const genHeader = ['email', 'company', 'name', 'phone'];
  const genRows = [];
  for (const s of subs) {
    const e = s.email.toLowerCase();
    if (!s.isActive) continue;
    if (customerSet.has(e)) continue;
    if (dirEmails.has(e)) continue;
    genRows.push([s.email, s.company || '', s.name || '', s.phone || '']);
  }

  writeCSV('customers.csv', custHeader, custRows);
  writeCSV('general.csv', genHeader, genRows);
  writeCSV('directory.csv', dirHeader, dirOut);

  // 요약
  const custActive = custRows.filter(r => r[6] === 'Y').length;
  const custBounced = custRows.filter(r => r[7] === 'Y').length;
  const dirSub = dirOut.filter(r => r[7] === 'Y').length;
  const dirCust = dirOut.filter(r => r[8] === 'Y').length;
  console.log('='.repeat(58));
  console.log('  3분류 리스트 생성 완료 → ' + OUT);
  console.log('='.repeat(58));
  console.log(`  ① 고객 customers.csv      : ${custRows.length}건`);
  console.log(`       (CRM시트 ${crmSheet.size} ∪ 광고주 ${adv.size}, 중복 제거)`);
  console.log(`       └ 활성 구독중 ${custActive} · 바운스 ${custBounced}`);
  console.log(`  ② 일반 general.csv        : ${genRows.length}건 (활성 구독자 중 고객·디렉토리 제외)`);
  console.log(`  ③ 기업디렉토리 directory.csv: ${dirOut.length}건 (WP 회사)`);
  console.log(`       └ 구독자와 일치(회사) ${dirSub} · 그중 고객 ${dirCust}`);
  console.log('-'.repeat(58));
  // 구독자(활성) 단위로 정확히 분류 검증 — 우선순위 고객>디렉토리>일반
  const activeSubs = subs.filter(s => s.isActive);
  let sCust = 0, sDir = 0, sGen = 0;
  for (const s of activeSubs) { const e = s.email.toLowerCase();
    if (customerSet.has(e)) sCust++; else if (dirEmails.has(e)) sDir++; else sGen++; }
  console.log(`  활성 구독자 ${activeSubs.length} 분류: 고객 ${sCust} + 기업디렉토리 ${sDir} + 일반 ${sGen} = ${sCust + sDir + sGen}`);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); }).finally(async () => await prisma.$disconnect());
