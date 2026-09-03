// ════════════════════════════════════════════════════════════════
// 워드프레스 페이지 본문 올리기 (page-content/*.html → WP 페이지)
// ────────────────────────────────────────────────────────────────
// 왜: wordpress-plugin/page-content/README.md 에 "REST API 로 올린다"는 방법만 적혀 있고
//     실행 도구가 없었다. 매번 손으로 fetch 코드를 쓰면 백업을 빼먹는다.
//     특히 위험한 것은 **덮어쓰기 전 백업** — 페이지 본문은 DB 에만 있어 되돌릴 길이 없다.
//
// 무엇을:
//   1) 올리기 전 현재 본문을 .tmp/page-backup-<slug>-<시각>.html 로 **반드시** 내려받는다
//   2) 슬러그로 페이지를 찾는다. 없으면 **초안(draft)으로 새로 만든다**
//      — 새 페이지를 곧바로 공개하지 않는 이유: 사람이 눈으로 보고 공개를 결정해야 한다.
//   3) 올린 뒤 되읽어 실제로 반영됐는지 확인한다 (올렸다는 말만 하고 끝내지 않는다)
//
// 실행:
//   node scripts/publish-page.js vietnam-visa.html --slug vietnam-visa --title "베트남 비자·입국 안내"
//   node scripts/publish-page.js vietnam-visa.html --slug vietnam-visa --dry      계획만 보기
//   node scripts/publish-page.js vietnam-visa.html --slug vietnam-visa --publish  공개 상태로
//
// .env: WORDPRESS_URL · WORDPRESS_USERNAME · WORDPRESS_APP_PASSWORD
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'wordpress-plugin', 'page-content');
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : null; };
const has = (name) => argv.includes('--' + name);

const file = argv.find((a) => !a.startsWith('--') && a.endsWith('.html'));
const SLUG = flag('slug');
const TITLE = flag('title');
const DRY = has('dry');
const GO_PUBLIC = has('publish');

const WP = (process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr').replace(/\/$/, '');
const USER = process.env.WORDPRESS_USERNAME;
const PASS = process.env.WORDPRESS_APP_PASSWORD;

function die(m) { console.error('\n✖ ' + m + '\n'); process.exit(1); }

if (!file) die('올릴 파일을 지정하세요.  예) node scripts/publish-page.js vietnam-visa.html --slug vietnam-visa');
if (!SLUG) die('--slug 을 지정하세요. 페이지 주소가 됩니다 (예: --slug vietnam-visa → /vietnam-visa/)');
if (!USER || !PASS) die('.env 에 WORDPRESS_USERNAME / WORDPRESS_APP_PASSWORD 가 필요합니다.');

const src = path.join(DIR, path.basename(file));
if (!fs.existsSync(src)) die(`파일이 없습니다: ${src}`);
const content = fs.readFileSync(src, 'utf8');

const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const api = (p, init = {}) => fetch(`${WP}/wp-json/wp/v2${p}`, {
  ...init,
  headers: { Authorization: auth, 'Content-Type': 'application/json', ...(init.headers || {}) },
});

(async () => {
  console.log(`■ 올릴 파일 : ${path.basename(src)}  (${content.length.toLocaleString()}자)`);
  console.log(`■ 대상 주소 : ${WP}/${SLUG}/`);

  // 본문에 쓰인 숏코드를 미리 보여준다 — 플러그인이 서버에 없으면 글자 그대로 노출된다.
  const codes = [...content.matchAll(/\[([a-z_]+)[^\]]*\]/g)].map((m) => m[1]);
  if (codes.length) {
    console.log(`■ 쓰인 숏코드: ${[...new Set(codes)].join(', ')}`);
    console.log('   ⚠️ 해당 플러그인이 서버에 설치·활성화돼 있어야 합니다. 아니면 대괄호가 그대로 보입니다.');
  }

  const found = await (await api(`/pages?slug=${encodeURIComponent(SLUG)}&status=publish,draft,pending,private&context=edit&_fields=id,slug,status,title,link`)).json();
  const page = Array.isArray(found) && found.length ? found[0] : null;

  if (page) {
    console.log(`■ 기존 페이지 발견: ID ${page.id} · 상태 ${page.status} · ${page.link}`);
  } else {
    console.log('■ 기존 페이지 없음 → 새로 만듭니다');
    if (!TITLE) die('새 페이지에는 --title 이 필요합니다.');
  }

  if (DRY) { console.log('\n미리보기였습니다. 실제로 올리려면 --dry 를 빼세요.'); return; }

  // ── 백업 (기존 페이지가 있을 때만) ─────────────────────────
  // 되돌릴 수 없는 작업 앞에서는 반드시 되돌릴 길을 먼저 만든다.
  if (page) {
    const cur = await (await api(`/pages/${page.id}?context=edit&_fields=content,title,slug,status`)).json();
    fs.mkdirSync('.tmp', { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const bak = `.tmp/page-backup-${SLUG}-${stamp}.html`;
    fs.writeFileSync(bak, cur.content && cur.content.raw ? cur.content.raw : '');
    console.log(`■ 기존 본문 백업 → ${bak}`);
  }

  const body = { content, slug: SLUG };
  if (TITLE) body.title = TITLE;
  // 새 페이지는 기본 draft. --publish 를 준 경우에만 공개한다.
  if (!page) body.status = GO_PUBLIC ? 'publish' : 'draft';
  else if (GO_PUBLIC) body.status = 'publish';

  const res = await api(page ? `/pages/${page.id}` : '/pages', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) die(`업로드 실패 HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  const saved = await res.json();

  // ── 되읽어 확인 ────────────────────────────────────────────
  const check = await (await api(`/pages/${saved.id}?context=edit&_fields=id,slug,status,link,content`)).json();
  const same = (check.content && check.content.raw || '').trim() === content.trim();

  console.log('\n■ 결과');
  console.log(`   ID     : ${check.id}`);
  console.log(`   상태   : ${check.status}${check.status === 'draft' ? '  (초안 — 아직 공개되지 않았습니다)' : ''}`);
  console.log(`   주소   : ${check.link}`);
  console.log(`   본문   : ${same ? '✅ 올린 내용과 일치' : '⚠️ 서버 본문이 다릅니다 (테마·필터가 손댔을 수 있음)'}`);
  if (check.status === 'draft') {
    console.log('\n   공개하려면: 워드프레스 관리자에서 「공개」를 누르거나, 이 명령에 --publish 를 붙이세요.');
  }
})().catch((e) => die(e.message));
