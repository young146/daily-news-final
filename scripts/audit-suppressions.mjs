// ════════════════════════════════════════════════════════════════
//  SendGrid 억제(suppression) 전체 점검 — 우리 명부와 대조 (읽기 전용)
// ────────────────────────────────────────────────────────────────
//  왜 만드나 (2026-09-04):
//    `audit-sendgrid-blocks.mjs` 는 **차단·반송만** 본다. 그런데 SendGrid 대시보드에
//    `UNSUBSCRIBE DROPS 221` 이 매일 찍히고 있었다 — **수신거부한 사람에게 계속
//    발송을 시도하고 있다**는 뜻이다. SendGrid 가 막아주니 사고는 안 나지만:
//      · 매일 요청 수(REQUESTS)만 부풀고
//      · 그 때문에 **배달률이 실제보다 낮게 보인다**
//      · 무엇보다 **수신거부 의사를 우리 명부가 반영하지 못하고 있다**
//
//  이 스크립트가 하는 일: 억제 목록 네 종류를 전부 받아 활성 명부와 대조한다.
//    bounces        반송 (죽은 주소)
//    blocks         수신 서버가 막음
//    spam_reports   스팸 신고
//    unsubscribes   수신거부  ← 기존 도구가 안 보던 것
//
//  ⚠️ 아무것도 지우지 않는다. 세기만 한다.
//     (지우는 것은 사람이 판단할 일 — 특히 '일시적' 항목을 지우면 멀쩡한 독자를 잃는다)
// ════════════════════════════════════════════════════════════════
import 'dotenv/config';
import prisma from '../lib/prisma.js';

const KEY = process.env.SENDGRID_API_KEY;
if (!KEY) {
  console.error('SENDGRID_API_KEY 가 없습니다.');
  process.exit(1);
}

/** 억제 목록 한 종류를 끝까지 받아 온다 (한 번에 500건씩) */
async function fetchAll(path) {
  const out = [];
  for (let offset = 0; offset < 80000; offset += 500) {
    const res = await fetch(
      `https://api.sendgrid.com/v3/${path}?limit=500&offset=${offset}`,
      { headers: { Authorization: `Bearer ${KEY}` } },
    );
    if (!res.ok) throw new Error(`${path} ${res.status} ${(await res.text()).slice(0, 120)}`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

const norm = (e) => String(e || '').trim().toLowerCase();

// ⚠️ 수신거부는 **`suppression/unsubscribes`** 다 (2026-09-04 실측).
//    처음에 `asm/suppressions/global` 을 봤더니 0 건이 나와 "수신거부는 없다"고 오판할 뻔했다.
//    그런데 대시보드에는 UNSUBSCRIBE DROPS 221 이 찍히고 있었다 —
//    `asm/…` 는 **그룹 수신거부**용이고 이 계정엔 그룹이 없다. 진짜 명단은 아래 경로에 있다.
const SOURCES = [
  ['수신거부',  'suppression/unsubscribes',   '⛔ 명부에서 빼야 한다 (본인 의사)'],
  ['스팸신고',  'suppression/spam_reports',   '⛔ 명부에서 빼야 한다 (신고당함)'],
  ['잘못된주소', 'suppression/invalid_emails', '⛔ 명부에서 빼야 한다 (형식·도메인 오류)'],
  ['반송',      'suppression/bounces',        '주소가 죽었는지 사유를 봐야 한다'],
  ['차단',      'suppression/blocks',         '일시적인 것이 많다 — 함부로 지우지 말 것'],
];

console.log('SendGrid 억제 목록을 받는 중… (4종류)\n');

const sets = {};
for (const [label, path] of SOURCES) {
  try {
    const rows = await fetchAll(path);
    sets[label] = new Set(rows.map((r) => norm(r.email)));
    console.log(`  ${label.padEnd(6)} ${String(rows.length).padStart(6)}건 · 중복 접으면 ${sets[label].size}개`);
  } catch (e) {
    sets[label] = new Set();
    console.log(`  ${label.padEnd(6)} 조회 실패: ${e.message}`);
  }
}

// 활성 구독자 명부
const subs = await prisma.subscriber.findMany({
  where: { isActive: true },
  select: { email: true },
});
const active = subs.map((s) => norm(s.email));
console.log(`\n활성 명부 ${active.length.toLocaleString()}명\n`);

console.log('─'.repeat(62));
console.log('■ 활성 명부 중 억제 목록에 걸린 사람');
console.log('─'.repeat(62));

let mustRemove = new Set();
for (const [label, , note] of SOURCES) {
  const hit = active.filter((e) => sets[label].has(e));
  console.log(`  ${label.padEnd(6)} ${String(hit.length).padStart(5)}명   ${note}`);
  if (label === '수신거부' || label === '스팸신고' || label === '잘못된주소') {
    hit.forEach((e) => mustRemove.add(e));
  }
}

// 실제로 낭비되는 발송량 = 어느 목록에든 걸린 사람 (중복 제거)
const anyHit = new Set();
for (const [label] of SOURCES) active.forEach((e) => { if (sets[label].has(e)) anyHit.add(e); });

console.log('─'.repeat(62));
console.log(`  합계(중복 제거) ${anyHit.size}명 — 매 발송의 ${(anyHit.size / active.length * 100).toFixed(1)}% 가 헛걸음`);
console.log(`  그중 **당장 빼야 하는 사람** ${mustRemove.size}명 (수신거부·스팸신고)`);
console.log('─'.repeat(62));

const realTargets = active.length - anyHit.size;
console.log(`\n■ 이 숫자가 뜻하는 것`);
console.log(`  명부에 적힌 사람      ${active.length.toLocaleString()}명`);
console.log(`  실제로 닿을 수 있는 사람 ${realTargets.toLocaleString()}명`);
console.log(`  → 대시보드의 '배달률'은 죽은 주소까지 분모에 넣어 세므로 **실제보다 낮게 보인다.**`);

await prisma.$disconnect();
