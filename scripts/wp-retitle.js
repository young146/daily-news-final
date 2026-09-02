// ════════════════════════════════════════════════════════════════
// 기사 제목 일괄 교체 (백업 + 되돌리기 포함)
// ────────────────────────────────────────────────────────────────
// 왜: 2026-09-02 조사 — 여행·라이프 기사 987편이 검색 7~9위에 있는데 CTR 1.44% 다.
//     원인은 제목이 *잡지 제목*이라 검색어와 안 맞는 것.
//     예) 「Travel - LCC(저비용 항공사)의 위기. 그 이유는?」
//         → "lcc 항공사" 로 523회 노출·8위인데 클릭 0.
//     본문은 그대로 두고 **제목만** 검색어에 맞추면 같은 순위에서 클릭이 는다.
//
// ⚠️ 원칙
//   - 본문·주소(slug)·발행일은 건드리지 않는다. **제목만** 바꾼다.
//     (slug 를 바꾸면 주소가 변해 쌓아둔 순위를 잃는다 — 절대 금지)
//   - 실행 전 원본 제목을 .tmp/retitle-backup-<시각>.json 에 반드시 남긴다.
//   - 되돌리기는 그 백업 파일로 한 번에 된다.
//
// 사용
//   node scripts/wp-retitle.js --dry                     제안 목록만 출력(기본)
//   node scripts/wp-retitle.js --apply                   실제 적용 (백업 자동 생성)
//   node scripts/wp-retitle.js --rollback <백업파일>      원래 제목으로 복구
//   node scripts/wp-retitle.js --apply --only 120073,96281   일부만 적용
//
// 제안 목록은 scripts/retitle-proposals.json 에 있다. 손으로 고쳐도 된다.
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const WP = (process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr').replace(/\/$/, '');
const AUTH = 'Basic ' + Buffer.from(
  `${process.env.WORDPRESS_USERNAME}:${process.env.WORDPRESS_APP_PASSWORD}`
).toString('base64');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

// 묶음(batch)별로 파일을 나눠 쓴다: --file retitle-proposals-2.json
const PROPOSALS = path.resolve(__dirname, val('--file') || 'retitle-proposals.json');
const TMPDIR = path.join(__dirname, '..', '.tmp');

const dec = (s) => String(s).replace(/&#8217;|&#8216;/g, "'").replace(/&#8211;|&#8212;/g, '-')
  .replace(/&amp;/g, '&').replace(/&#8230;/g, '…').replace(/&#[0-9]+;/g, '').replace(/&[a-z]+;/g, '');

async function getPost(id) {
  const r = await fetch(`${WP}/wp-json/wp/v2/posts/${id}?context=edit&_fields=id,title,link,slug`,
    { headers: { Authorization: AUTH } });
  if (!r.ok) throw new Error(`GET ${id} → ${r.status}`);
  return r.json();
}

async function setTitle(id, title) {
  const r = await fetch(`${WP}/wp-json/wp/v2/posts/${id}`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    // slug 를 함께 보내지 않는 것이 핵심 — 워드프레스는 제목만 바꾸면 주소를 유지한다.
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error(`POST ${id} → ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

async function rollback(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`■ 되돌리기: ${backup.length}편 (${file})`);
  for (const b of backup) {
    try {
      await setTitle(b.id, b.original);
      console.log(`   ✅ [${b.id}] → ${b.original}`);
    } catch (e) {
      console.log(`   ❌ [${b.id}] ${e.message}`);
    }
  }
}

(async () => {
  if (has('--rollback')) {
    const f = val('--rollback');
    if (!f || !fs.existsSync(f)) { console.error('백업 파일 경로가 필요합니다.'); process.exit(1); }
    return rollback(f);
  }

  let items = JSON.parse(fs.readFileSync(PROPOSALS, 'utf8'));
  const only = val('--only');
  if (only) {
    const set = new Set(only.split(',').map((s) => parseInt(s.trim(), 10)));
    items = items.filter((i) => set.has(i.id));
  }

  const apply = has('--apply');
  console.log(apply ? `■ 적용 — ${items.length}편` : `■ 미리보기(dry-run) — ${items.length}편`);
  console.log('  본문·주소·발행일은 건드리지 않습니다. 제목만 바꿉니다.\n');

  const backup = [];
  let ok = 0, skip = 0, fail = 0;

  for (const it of items) {
    let post;
    try { post = await getPost(it.id); }
    catch (e) { console.log(`❌ [${it.id}] 읽기 실패 — ${e.message}`); fail++; continue; }

    const cur = dec(post.title.raw || post.title.rendered);
    if (cur === it.new) { console.log(`⏭  [${it.id}] 이미 반영됨`); skip++; continue; }

    console.log(`[${it.id}]  노출 ${String(it.imp).padStart(5)} · ${String(it.pos).padStart(4)}위 · CTR ${it.ctr}`);
    console.log(`   지금: ${cur}`);
    console.log(`   제안: ${it.new}`);
    console.log(`   노림: ${it.target}`);

    backup.push({ id: it.id, original: cur, applied: it.new, link: post.link });

    if (apply) {
      try { await setTitle(it.id, it.new); console.log('   ✅ 적용됨'); ok++; }
      catch (e) { console.log(`   ❌ 실패 — ${e.message}`); fail++; }
      await new Promise((r) => setTimeout(r, 400));   // 서버 부담 완화
    }
    console.log();
  }

  if (apply && backup.length) {
    fs.mkdirSync(TMPDIR, { recursive: true });
    const f = path.join(TMPDIR, `retitle-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(f, JSON.stringify(backup, null, 1), 'utf8');
    console.log(`■ 완료 — 성공 ${ok} · 건너뜀 ${skip} · 실패 ${fail}`);
    console.log(`■ 원본 제목 백업: ${f}`);
    console.log(`   되돌리려면:  node scripts/wp-retitle.js --rollback "${f}"`);
  } else if (!apply) {
    console.log('■ 미리보기였습니다. 실제로 바꾸려면 --apply 를 붙이세요.');
  }
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
