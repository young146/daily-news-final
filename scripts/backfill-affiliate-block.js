// ════════════════════════════════════════════════════════════════
// 기존 발행 기사에 "제휴 추천 블록" 백필
// ────────────────────────────────────────────────────────────────
// 무엇: 이미 발행된 글(검색 유입 자산)의 본문 끝에 lib/affiliate-block.js 의 추천 블록을
//       추가한다. 새 글은 발행 시 자동으로 붙지만, 기존 2.5만 글은 이 스크립트로 소급.
// 어떻게: WP REST로 최신글부터(내림차순) 페이지네이션. content.raw 에 블록이 이미 있으면
//         (우리 /go/ 링크 존재) 건너뜀 → 두 번 돌려도 중복 안 붙음(idempotent).
// 재개: OS 임시폴더에 커서(마지막 처리 날짜) 저장 → 중단해도 이어서 실행.
//       처음부터: RESET=1. 청크: BACKFILL_LIMIT=500. 미리보기(쓰기 안 함): DRY=1.
//
// 실행: npm run backfill-affiliate              (전부, 실제 쓰기)
//       DRY=1 npm run backfill-affiliate        (몇 개 대상인지만, 쓰기 안 함)
//       BACKFILL_LIMIT=200 npm run backfill-affiliate   (이번엔 200개만)
//       RESET=1 npm run backfill-affiliate      (커서 초기화)
//
// 필요 env: WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
if (!process.env.WORDPRESS_APP_PASSWORD) {
  const os = require('os'), fs = require('fs'), path = require('path');
  const secret = process.env.SECRETS_ENV
    || path.join(os.homedir(), 'OneDrive', 'dev-secrets', 'daily-news-final', '.env');
  if (fs.existsSync(secret)) require('dotenv').config({ path: secret });
}

const os = require('os');
const fs = require('fs');
const path = require('path');

const WP = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
const USER = process.env.WORDPRESS_USERNAME || 'chaovietnam';
const PASS = process.env.WORDPRESS_APP_PASSWORD;
const LIMIT = parseInt(process.env.BACKFILL_LIMIT || '0', 10); // 0 = 무제한
const DRY = process.env.DRY === '1';
const STATE_FILE = path.join(os.tmpdir(), 'affiliate-backfill-chaovietnam.json');

// 블록이 이미 붙었는지 판별하는 마커(우리 /go/ 리다이렉트 도메인). 매우 고유 → 오탐 없음.
const GO_MARKER = '/go/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const authHeader = () => 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

function loadState() {
  if (process.env.RESET === '1') return { before: null, done: 0, set: 0, skip: 0 };
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { before: null, done: 0, set: 0, skip: 0 }; }
}
function saveState(st) { try { fs.writeFileSync(STATE_FILE, JSON.stringify(st)); } catch {} }

async function main() {
  if (!PASS) { console.error('[aff-backfill] WORDPRESS_APP_PASSWORD 없음. 중단.'); process.exit(1); }

  // ESM 모듈(lib/affiliate-block.js)을 동적 import — 새 글과 완전히 동일한 블록 사용.
  const { buildAffiliateBlockHtml } = await import('../lib/affiliate-block.js');

  const st = loadState();
  console.log(`[aff-backfill]${DRY ? ' (DRY-RUN, 쓰기 안 함)' : ''} 시작 — 누적 처리 ${st.done}, 추가 ${st.set}, 스킵 ${st.skip}${st.before ? ` / 이어서: ${st.before}` : ' / 최신글부터'}${LIMIT ? ` / 이번 최대 ${LIMIT}` : ''}`);

  let processedThisRun = 0;
  while (true) {
    if (LIMIT && processedThisRun >= LIMIT) { console.log(`[aff-backfill] 이번 한도(${LIMIT}) 도달 — 중단(다음에 이어서).`); break; }

    const params = new URLSearchParams({ per_page: '25', orderby: 'date', order: 'desc', context: 'edit', _fields: 'id,date,content,categories' });
    if (st.before) params.set('before', st.before);
    const res = await fetch(`${WP}/wp-json/wp/v2/posts?${params}`, { headers: { Authorization: authHeader() } });
    if (!res.ok) { console.error(`[aff-backfill] 목록 조회 실패 ${res.status} — 잠시 후 재실행 권장.`); break; }
    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) { console.log('[aff-backfill] ✅ 더 이상 글 없음 — 전체 완료.'); saveState({ ...st, before: null }); break; }

    for (const p of posts) {
      st.before = p.date;
      const content = (p.content && p.content.raw) || '';

      // 이미 블록 있으면(또는 우리 /go/ 링크 존재) 건너뜀 — 중복 방지
      if (content.includes(GO_MARKER)) { st.skip++; st.done++; processedThisRun++; continue; }

      // 카테고리는 REST 미노출(커스텀 메타)이라 기본 조합(알리·타오바오) 사용. src=archive 로 옛글 클릭 구분.
      const block = buildAffiliateBlockHtml(null, 'archive');
      if (!block) { st.skip++; st.done++; processedThisRun++; continue; }

      if (DRY) {
        st.set++; st.done++; processedThisRun++;
        if (st.set <= 2) console.log(`  [DRY] #${p.id} 붙일 예정 (블록 ${block.length}자)`);
        continue;
      }

      const up = await fetch(`${WP}/wp-json/wp/v2/posts/${p.id}`, {
        method: 'POST',
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content + block }),
      });
      if (up.ok) { st.set++; } else { console.warn(`[aff-backfill] #${p.id} 쓰기 실패 ${up.status}`); }
      st.done++; processedThisRun++;
      if (st.done % 25 === 0) { console.log(`  진행 ${st.done} (추가 ${st.set} / 스킵 ${st.skip})`); saveState(st); }
      await sleep(200);
    }
    saveState(st);
    if (DRY && LIMIT && processedThisRun >= LIMIT) break;
  }

  saveState(st);
  console.log(`\n[aff-backfill] 종료 — 누적 처리 ${st.done} / 추가 ${st.set} / 스킵 ${st.skip}`);
  if (!DRY) console.log('[aff-backfill] 남았으면 같은 명령 재실행 → 이어서 진행.');
}

main().catch((e) => { console.error('[aff-backfill] 오류:', e.message); process.exit(1); });
