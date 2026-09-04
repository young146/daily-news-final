/**
 * 수신거부·스팸신고한 사람을 명부에서 뺀다.
 * =====================================================================
 * 왜 (2026-09-04 사장님): *"거부했는데도 보내면 안 되지."*
 *
 * 무엇이 문제였나:
 *   SendGrid 억제 목록에 **수신거부 222명**이 있는데 우리 명부에는 활성으로 남아 있었다.
 *   그래서 매 발송마다 그 222명에게 발송을 **시도**하고, SendGrid 가 막아 왔다
 *   (대시보드의 `UNSUBSCRIBE DROPS 221`). 실제로 메일이 가지는 않았지만:
 *     · 본인 의사가 우리 명부에 반영되지 않은 상태였다  ← 이게 본질
 *     · 요청 수만 부풀어 **배달률이 실제보다 낮게 보였다**
 *
 * 무엇을 빼나 — **거부 의사가 분명한 것만**:
 *   · unsubscribes   그만 받겠다고 직접 누른 사람
 *   · spam_reports   스팸으로 신고한 사람 (수신거부보다 더 강한 의사)
 *
 * 🔴 무엇을 안 빼나 (섞으면 안 된다):
 *   · bounces / blocks → **거부가 아니라 배달 실패**다. 한국 포털은 대량 발송자를
 *     걸러낼 때 거짓으로 "계정 없음"을 답하기도 한다 — 2026-08-28 에 그 말을 믿고
 *     84명을 껐다가 전원 되살린 적이 있다. 이 스크립트는 그쪽을 아예 건드리지 않는다.
 *   · invalid_emails → 형식·도메인 오류라 거부 의사와는 다른 문제. 따로 판단한다.
 *
 * 쓰는 법:
 *   node scripts/deactivate-unsubscribed.mjs           미리보기 (아무것도 안 바꿈)
 *   node scripts/deactivate-unsubscribed.mjs --apply   실제로 끈다
 *
 * 되돌리기: 끄기 전 명단을 `.tmp/unsubscribed-backup-<시각>.json` 에 남긴다.
 *   (되돌릴 일은 없어야 한다 — 본인이 거부한 것이므로)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '../lib/prisma.js';

const APPLY = process.argv.includes('--apply');
const KEY = process.env.SENDGRID_API_KEY;
if (!KEY) {
  console.error('SENDGRID_API_KEY 가 없습니다.');
  process.exit(1);
}

async function fetchAll(pathname) {
  const out = [];
  for (let offset = 0; offset < 80000; offset += 500) {
    const res = await fetch(
      `https://api.sendgrid.com/v3/${pathname}?limit=500&offset=${offset}`,
      { headers: { Authorization: `Bearer ${KEY}` } },
    );
    if (!res.ok) throw new Error(`${pathname} ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

const norm = (e) => String(e || '').trim().toLowerCase();

console.log('SendGrid 에서 거부 명단을 받는 중…\n');
const unsub = await fetchAll('suppression/unsubscribes');
const spam = await fetchAll('suppression/spam_reports');
console.log(`  수신거부 ${unsub.length}명 · 스팸신고 ${spam.length}명`);

// 어느 쪽에서 왔는지 기억해 둔다 (기록에 남긴다)
const reason = new Map();
for (const r of unsub) reason.set(norm(r.email), '수신거부');
for (const r of spam) reason.set(norm(r.email), '스팸신고');   // 더 강한 의사로 덮어쓴다

const emails = [...reason.keys()];

const before = await prisma.subscriber.count({ where: { isActive: true } });
const targets = await prisma.subscriber.findMany({
  where: { email: { in: emails }, isActive: true },
  select: { id: true, email: true, name: true, createdAt: true },
});

console.log(`\n활성 명부 ${before.toLocaleString()}명 중 **${targets.length}명**이 거부 상태입니다.\n`);
if (!targets.length) {
  console.log('뺄 사람이 없습니다.');
  await prisma.$disconnect();
  process.exit(0);
}

// 도메인별로 묶어 보여준다 — 특정 포털에 쏠렸으면 그건 다른 문제일 수 있다
const byDomain = {};
for (const t of targets) {
  const d = norm(t.email).split('@')[1] || '?';
  byDomain[d] = (byDomain[d] || 0) + 1;
}
console.log('■ 도메인별');
for (const [d, n] of Object.entries(byDomain).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`   ${String(n).padStart(4)}명  ${d}`);
}

console.log('\n■ 사유별');
const byReason = {};
for (const t of targets) {
  const r = reason.get(norm(t.email)) || '?';
  byReason[r] = (byReason[r] || 0) + 1;
}
for (const [r, n] of Object.entries(byReason)) console.log(`   ${String(n).padStart(4)}명  ${r}`);

console.log('\n■ 예시 5명');
for (const t of targets.slice(0, 5)) {
  const e = t.email;
  const masked = e.replace(/^(.{2}).*(@.*)$/, '$1***$2');   // 로그에 주소를 통째로 남기지 않는다
  console.log(`   ${masked}  (${reason.get(norm(e))}, 가입 ${String(t.createdAt).slice(0, 10)})`);
}

if (!APPLY) {
  console.log('\n미리보기였습니다. 실제로 빼려면 --apply 를 붙이세요.');
  await prisma.$disconnect();
  process.exit(0);
}

// 끄기 전 명단 백업
fs.mkdirSync('.tmp', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backup = path.join('.tmp', `unsubscribed-backup-${stamp}.json`);
fs.writeFileSync(backup, JSON.stringify(
  targets.map((t) => ({ ...t, reason: reason.get(norm(t.email)) })), null, 1));
console.log(`\n명단 백업 → ${backup}`);

const res = await prisma.subscriber.updateMany({
  where: { id: { in: targets.map((t) => t.id) } },
  data: { isActive: false },
});
const after = await prisma.subscriber.count({ where: { isActive: true } });

console.log(`\n✅ ${res.count}명을 명부에서 뺐습니다.`);
console.log(`   활성 명부 ${before.toLocaleString()} → ${after.toLocaleString()}명`);
console.log('   다음 발송부터 이분들에게는 시도조차 하지 않습니다.');

await prisma.$disconnect();
