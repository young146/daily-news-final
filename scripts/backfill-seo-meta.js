// ════════════════════════════════════════════════════════════════
// 기존 글 SEO 메타(rank_math_description) 백필
// ────────────────────────────────────────────────────────────────
// 무엇: 이미 발행된 글들의 Rank Math SEO 설명이 비어(폴백 의존) 있는 것을,
//       깨끗한 요약문으로 명시 세팅한다. → 구글/소셜 설명 일치 + "출처/날짜" 군더더기 제거.
// 어떻게: WP REST로 최신글부터(내림차순) 페이지네이션. 이미 세팅된 글/수동 최적화된 글은
//         건너뜀(덮어쓰지 않음). 원문 요약 없으면 스킵. 0.15초 간격으로 안전하게.
// 재개: OS 임시폴더에 커서(마지막 처리 날짜) 저장 → 중단해도 이어서 실행.
//       처음부터 다시 하려면: 실행 시 RESET=1 로.
// 청크 실행: BACKFILL_LIMIT=500 처럼 개수 제한 가능(하루 몇 번 나눠 돌리기).
//
// 실행: npm run backfill-seo            (전부)
//       BACKFILL_LIMIT=1000 npm run backfill-seo   (이번엔 1000개만)
//       RESET=1 npm run backfill-seo    (커서 초기화, 최신글부터 다시)
//
// ⚠️ mu-plugin(rankmath-rest-meta.php)이 서버에 올라가 있어야 rank_math_description 이 저장됨.
//    안 올라가 있으면 세팅해도 반영 안 됨(그땐 검증 스크립트가 경고).
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
const STATE_FILE = path.join(os.tmpdir(), 'seo-backfill-chaovietnam.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = () => Buffer.from(`${USER}:${PASS}`).toString('base64');

// 4바이트 이모지 제거(비 utf8mb4 DB 대비) + 앞머리 "출처/날짜" 군더더기 제거
function stripEmoji(s) { return s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''); }
function cleanSource(text) {
  let s = String(text || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  s = s.replace(/출처\s*[:：].*?날짜\s*[:：]\s*[\d.\s]+/s, ' '); // "출처:… 날짜:…" 통째 제거
  s = s.replace(/^\s*(출처|날짜)\s*[:：][^\n]*/gm, ' ');
  return stripEmoji(s).replace(/\s+/g, ' ').trim();
}
function buildDesc(text) {
  let s = cleanSource(text);
  const MAX = 160;
  if (s.length > MAX) {
    const cut = s.slice(0, MAX);
    const sp = cut.lastIndexOf(' ');
    s = (sp > 80 ? cut.slice(0, sp) : cut).trim() + '…';
  }
  return s;
}

function loadState() {
  if (process.env.RESET === '1') return { before: null, done: 0, set: 0, skip: 0 };
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { before: null, done: 0, set: 0, skip: 0 }; }
}
function saveState(st) { try { fs.writeFileSync(STATE_FILE, JSON.stringify(st)); } catch {} }

async function main() {
  if (!PASS) { console.error('[backfill] WORDPRESS_APP_PASSWORD 없음. 중단.'); process.exit(1); }
  const st = loadState();
  console.log(`[backfill] 시작 (누적 처리 ${st.done}, 세팅 ${st.set}, 스킵 ${st.skip})${st.before ? ` — 이어서: ${st.before}` : ' — 최신글부터'}${LIMIT ? ` / 이번 최대 ${LIMIT}개` : ''}`);

  let processedThisRun = 0;
  while (true) {
    if (LIMIT && processedThisRun >= LIMIT) { console.log(`[backfill] 이번 실행 한도(${LIMIT}) 도달. 중단(다음에 이어서).`); break; }

    const params = new URLSearchParams({ per_page: '50', orderby: 'date', order: 'desc', context: 'edit', _fields: 'id,date,excerpt,meta' });
    if (st.before) params.set('before', st.before);
    const res = await fetch(`${WP}/wp-json/wp/v2/posts?${params}`, { headers: { Authorization: `Basic ${auth()}` } });
    if (!res.ok) { console.error(`[backfill] 목록 조회 실패 ${res.status}. 잠시 후 재시도 권장.`); break; }
    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) { console.log('[backfill] ✅ 더 이상 글 없음 — 전체 완료.'); saveState({ ...st, before: null }); break; }

    for (const p of posts) {
      const meta = p.meta || {};
      const existing = (meta.rank_math_description || '').trim();
      if (existing) { st.skip++; st.done++; processedThisRun++; st.before = p.date; continue; } // 이미 세팅됨(수동 포함) → 안 건드림

      const src = meta.news_summary || (p.excerpt && p.excerpt.raw) || (p.excerpt && p.excerpt.rendered) || '';
      const desc = buildDesc(src);
      if (!desc || desc.length < 10) { st.skip++; st.done++; processedThisRun++; st.before = p.date; continue; } // 원문 요약 없음 → 폴백에 맡김

      const up = await fetch(`${WP}/wp-json/wp/v2/posts/${p.id}`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: { rank_math_description: desc } }),
      });
      if (up.ok) { st.set++; } else { console.warn(`[backfill] #${p.id} 쓰기 실패 ${up.status}`); }
      st.done++; processedThisRun++; st.before = p.date;
      if (st.done % 50 === 0) { console.log(`  진행 ${st.done} (세팅 ${st.set} / 스킵 ${st.skip})`); saveState(st); }
      await sleep(150);
    }
    saveState(st);
  }

  saveState(st);
  console.log(`\n[backfill] 종료 — 누적 처리 ${st.done} / 세팅 ${st.set} / 스킵 ${st.skip}`);
  console.log('[backfill] 아직 남았으면 같은 명령을 한 번 더 실행하면 이어서 진행됩니다.');
}

main().catch((e) => { console.error('[backfill] 오류:', e.message); process.exit(1); });
