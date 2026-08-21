// ════════════════════════════════════════════════════════════════
// 기사 본문에서 제휴 블록 걷어내기 (본문은 깨끗하게, 광고는 슬롯이 담당)
// ────────────────────────────────────────────────────────────────
// 왜: 제휴/광고를 기사 본문 HTML 에 박아 넣는 방식은 임시방편이었다.
//     · 카테고리마다 다르게 들어가고, 디자인을 바꾸면 1.6만 건을 다시 고쳐야 함.
//     · 회사 표준은 **통합 광고센터(ads_unified) → 공개 API → 각 지면 자동 삽입**.
//     따라서 본문에 남은 제휴 블록(<div class="chaovn-aff">…</div>)은 전부 제거하고,
//     노출은 통합 광고 플러그인(xinchao-unified-ads)이 담당하게 한다.
//
// 안전장치: 중첩 div 를 세어 블록만 정확히 잘라냄. 본문 텍스트는 손대지 않음.
//           블록이 없으면 건너뜀(idempotent). 커서 저장 → 중단해도 이어서.
//
// 실행: DRY=1 node scripts/clean-affiliate-block.js      (미리보기)
//       LIMIT=100 node scripts/clean-affiliate-block.js  (100건만)
//       node scripts/clean-affiliate-block.js            (전부)
//       RESET=1 ...                                      (커서 초기화)
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
const LIMIT = parseInt(process.env.LIMIT || '0', 10);
const DRY = process.env.DRY === '1';
const STATE_FILE = path.join(os.tmpdir(), 'affiliate-clean-chaovietnam.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const authHeader = () => 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

function loadState() {
  if (process.env.RESET === '1') return { before: null, done: 0, cleaned: 0, skip: 0 };
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { before: null, done: 0, cleaned: 0, skip: 0 }; }
}
function saveState(st) { try { fs.writeFileSync(STATE_FILE, JSON.stringify(st)); } catch {} }

/** <div class="chaovn-aff" ...> … </div> 블록을 (여러 개라도) 전부 제거 */
function stripAll(html) {
  // 제휴 블록 여는 태그 찾기 — 정규식 이스케이프 문제를 피하려고 문자열 검색만 쓴다.
  //  ① 신형: <div class="chaovn-aff" ...>
  //  ② 구형: <div style="...background:#fffaf5">   ← class 가 없던 시절(대다수)
  function findOpen(s, from) {
    const cands = [];
    const i1 = s.indexOf('<div class="chaovn-aff"', from);
    if (i1 !== -1) cands.push(i1);
    // 구형: '#fffaf5' 를 품은 <div ...> 태그의 시작점을 역으로 찾는다
    let i2 = s.indexOf('background:#fffaf5', from);
    while (i2 !== -1) {
      const open = s.lastIndexOf('<div', i2);
      const close = s.indexOf('>', i2);
      // '<div' 와 '>' 사이에 있어야 그 태그의 속성이다
      if (open !== -1 && close !== -1 && open < i2 && i2 < close) { cands.push(open); break; }
      i2 = s.indexOf('background:#fffaf5', i2 + 1);
    }
    return cands.length ? Math.min.apply(null, cands) : -1;
  }

  let out = html, removed = 0;
  for (;;) {
    const start = findOpen(out, 0);
    if (start === -1) break;
    // 중첩 div 를 세어 정확히 닫는 </div> 를 찾는다
    let depth = 0, i = start, end = -1;
    while (i < out.length) {
      const nOpen = out.indexOf('<div', i);
      const nClose = out.indexOf('</div>', i);
      if (nClose === -1) break;
      if (nOpen !== -1 && nOpen < nClose) { depth++; i = nOpen + 4; }
      else { depth--; i = nClose + 6; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) break;                       // 짝이 안 맞으면 손대지 않는다
    out = out.slice(0, start) + out.slice(end);
    removed++;
  }
  return { html: out.replace(/\s+$/, ''), removed };
}

async function main() {
  if (!PASS) { console.error('[aff-clean] WORDPRESS_APP_PASSWORD 없음. 중단.'); process.exit(1); }

  const st = loadState();
  console.log(`[aff-clean]${DRY ? ' (DRY-RUN)' : ''} 시작 — 누적 ${st.done} (정리 ${st.cleaned} / 스킵 ${st.skip})${st.before ? ` / 이어서 ${st.before}` : ' / 최신글부터'}${LIMIT ? ` / 이번 최대 ${LIMIT}` : ''}`);

  let run = 0;
  outer:
  while (true) {
    // 검색으로 '제휴 블록이 있는 글'만 골라 처리한다(전체 2.7만 건을 훑지 않음 → 훨씬 빠름).
    // 처리하면 검색 대상에서 빠지므로 항상 1페이지만 반복해서 가져오면 된다.
    const params = new URLSearchParams({ per_page: '25', search: '교민이 자주 찾는 서비스', orderby: 'date', order: 'desc', context: 'edit', _fields: 'id,date,content' });
    const res = await fetch(`${WP}/wp-json/wp/v2/posts?${params}`, { headers: { Authorization: authHeader() } });
    if (!res.ok) { console.error(`[aff-clean] 목록 조회 실패 ${res.status}`); break; }
    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) { console.log('[aff-clean] ✅ 더 이상 글 없음 — 전체 완료.'); saveState({ ...st, before: null }); break; }

    for (const p of posts) {
      if (LIMIT && run >= LIMIT) { console.log(`[aff-clean] 한도(${LIMIT}) 도달 — 중단(다음에 이어서).`); break outer; }
      st.before = p.date; run++; st.done++;

      const content = (p.content && p.content.raw) || '';
      const { html: next, removed } = stripAll(content);
      if (!removed) { st.skip++; continue; }

      if (DRY) {
        if (st.cleaned < 3) console.log(`  [DRY] #${p.id} 블록 ${removed}개 제거 (${content.length}→${next.length}자)`);
        st.cleaned++; continue;
      }

      const up = await fetch(`${WP}/wp-json/wp/v2/posts/${p.id}`, {
        method: 'POST',
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: next }),
      });
      if (up.ok) st.cleaned++;
      else console.warn(`[aff-clean] #${p.id} 쓰기 실패 ${up.status}`);

      if (st.done % 25 === 0) { console.log(`  진행 ${st.done} (정리 ${st.cleaned} / 스킵 ${st.skip})`); saveState(st); }
      await sleep(200);
    }
    saveState(st);
  }

  saveState(st);
  console.log(`\n[aff-clean] 종료 — 누적 ${st.done} / 정리 ${st.cleaned} / 스킵 ${st.skip}`);
  if (!DRY) console.log('[aff-clean] 남았으면 같은 명령 재실행 → 이어서 진행.');
}

main().catch((e) => { console.error('[aff-clean] 오류:', e.message); process.exit(1); });
