// KOCHAM 디렉토리 전량 크롤 실행기
// 사용: node scripts/crawlers/run-kocham-crawl.js [maxPages] [delayMs]
// 출력: C:/Users/XINCHAO/Downloads/kocham_directory_<날짜>.json (+ .csv)
const fs = require('fs');
const { parseDirectoryPage, fetchPage } = require('./kocham-directory.js');

const OUT_DIR = 'C:/Users/XINCHAO/Downloads';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(cp, tries = 3) {
  for (let t = 1; t <= tries; t++) {
    try { return await fetchPage(cp); }
    catch (e) {
      if (t === tries) throw e;
      await sleep(2000 * t);
    }
  }
}

function toCSV(rows) {
  const cols = ['company_kr', 'company_en', 'industry_group', 'area', 'tel', 'address', 'branch', 'last_fee', 'fee_dates'];
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : (v == null ? '' : String(v));
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

(async () => {
  const maxPages = parseInt(process.argv[2] || '281', 10);
  const delayMs = parseInt(process.argv[3] || '1200', 10);
  const all = [];
  const errors = [];
  const t0 = Date.now();

  for (let cp = 1; cp <= maxPages; cp++) {
    try {
      const html = await fetchWithRetry(cp);
      const companies = parseDirectoryPage(html);
      all.push(...companies);
      if (cp % 10 === 0 || cp === maxPages) {
        const el = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`[${cp}/${maxPages}] 누적 ${all.length}건 · ${el}s`);
      }
      if (companies.length === 0) console.log(`  ⚠️ cp=${cp} 0건 (끝일 수 있음)`);
    } catch (e) {
      errors.push({ cp, error: e.message });
      console.log(`  ❌ cp=${cp} 실패: ${e.message}`);
    }
    if (cp < maxPages) await sleep(delayMs);
  }

  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = `${OUT_DIR}/kocham_directory_${date}.json`;
  const csvPath = `${OUT_DIR}/kocham_directory_${date}.csv`;
  fs.writeFileSync(jsonPath, JSON.stringify({ crawled_at: new Date().toISOString(), total: all.length, errors, companies: all }, null, 2), 'utf8');
  fs.writeFileSync(csvPath, '﻿' + toCSV(all), 'utf8');

  console.log(`\n✅ 완료: ${all.length}건 / 에러 ${errors.length}건`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   CSV : ${csvPath}`);
  if (errors.length) console.log(`   실패 페이지: ${errors.map((e) => e.cp).join(', ')}`);
})();
