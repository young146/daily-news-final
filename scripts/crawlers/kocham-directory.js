// KOCHAM 베트남 진출기업 디렉토리 크롤러
// 출처: https://kochamvietnam.com/service/directory/company/list?cp=N (10건/페이지, ~281p)
// 수집 필드: area, industry_group(KR), company_kr, company_en, tel, office, branch, fee_dates[]
// ⚠️ 원본에 email/homepage/대표자 없음 — 그건 별도 보강 트랙에서 처리
const cheerio = require('cheerio');

// HTML 한 페이지(cp) → 회사 배열. 회사 1건 = <tr rowspan=2> + 다음 <tr>(주소/회비)
function parseDirectoryPage(html) {
  const $ = cheerio.load(html);
  const companies = [];
  const rows = $('table tbody tr').toArray();

  for (let i = 0; i < rows.length; i++) {
    const $r = $(rows[i]);
    const $areaTd = $r.children('td[rowspan="2"]').first();
    if (!$areaTd.length) continue; // 첫 행만 처리, 주소행은 건너뜀

    const area = $areaTd.text().trim();
    const $boxText = $r.find('.box-text');
    const industry = ($boxText.find('p small strong').first().text().match(/\[(.+?)\]/) || [, ''])[1].trim();
    const company_kr = $boxText.find('> strong').first().text().trim();
    const company_en = $boxText.find('> small').first().text().trim();
    // tel = 3번째 td (지역/상호 제외). HTML에 주석 잔재 있어 텍스트만 추출
    const tel = $r.children('td').last().text().replace(/\s+/g, ' ').trim();

    // 다음 행 = 주소 + 회비납부일
    let office = '', branch = '', feeDates = [];
    const $next = $(rows[i + 1]);
    if ($next.length && $next.children('td[colspan="2"]').length) {
      const $blockAdd = $next.find('.block-add');
      $blockAdd.find('p').each((_, p) => {
        const t = $(p).text().replace(/\s+/g, ' ').trim();
        if (/^OFFICE:/i.test(t)) office = t.replace(/^OFFICE:\s*/i, '').trim();
        else if (/^BRANCH:/i.test(t)) branch = t.replace(/^BRANCH:\s*/i, '').trim();
        else if (t && !office) office = t;
      });
      $next.find('.korcham_member p').each((_, p) => {
        const m = $(p).text().match(/(\d{4})[.\-/](\d{1,2})/);
        if (m) feeDates.push(`${m[1]}.${m[2].padStart(2, '0')}`);
      });
    }

    if (company_kr || company_en) {
      companies.push({
        company_kr, company_en,
        company: company_en || company_kr,
        industry_group: industry,
        area,
        tel,
        address: office,
        branch,
        fee_dates: feeDates,
        last_fee: feeDates.length ? feeDates.sort().slice(-1)[0] : '',
      });
    }
  }
  return companies;
}

const PAGE_URL = (cp) => `https://kochamvietnam.com/service/directory/company/list?cp=${cp}`;

async function fetchPage(cp) {
  const res = await fetch(PAGE_URL(cp), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XinchaoDirectoryBot/1.0)' },
  });
  if (!res.ok) throw new Error(`cp=${cp} HTTP ${res.status}`);
  return res.text();
}

module.exports = { parseDirectoryPage, fetchPage, PAGE_URL };
