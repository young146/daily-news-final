/**
 * 잘못 막힌 구독자를 되살린다.
 * =====================================================================
 * 왜 필요한가 (2026-08-28):
 *   사장님이 직접 구독 신청을 하셨는데, 명부에는 들어왔지만 **SendGrid 가
 *   그 주소를 반송 목록에 올려 두고 막고 있었다.** 사유는
 *   `550 5.1.1 No such user` — 네이버가 "그런 계정 없다" 고 답한 것이다.
 *   **그런데 그 계정은 실재한다.** 한국 포털이 대량 발송자를 걸러낼 때
 *   이렇게 거짓으로 답하는 경우가 있다.
 *
 *   즉 "수신 서버가 계정 없다고 했다" 는 말을 그대로 믿으면 **멀쩡한 독자를
 *   우리 손으로 잘라내게 된다.** 실제로 그날 끈 542명 중 121명이 대형 포털이었다.
 *
 * 무엇을 되살리나
 *   ① 한국 포털(naver·hanmail·daum·nate·kakao)인데 "계정 없음" 으로 꺼진 주소
 *      → 명부를 다시 켜고, 차단 목록에서도 뺀다
 *      ⚠️ gmail 은 제외한다. **구글은 「계정 없음」을 정확히 답한다.**
 *   ② 명부에는 살아 있는데 SendGrid 차단 목록에 걸려 메일이 안 나가던 주소 전체
 *      → 차단 목록에서만 뺀다 (명부는 이미 켜져 있다)
 *
 * 위험은 낮다: 진짜 없는 계정이면 **다음 발송에서 다시 반송되어 목록에 되돌아간다.**
 *   한 번 지나가면 저절로 정리되고, 그동안 멀쩡한 사람은 메일을 받는다.
 *
 * 쓰는 법:
 *   node scripts/revive-blocked-subscribers.mjs           미리보기(아무것도 안 바꿈)
 *   node scripts/revive-blocked-subscribers.mjs --apply   실제로 되살린다
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const KEY = process.env.SENDGRID_API_KEY;
if (!KEY) {
  console.error('SENDGRID_API_KEY 가 없다.');
  process.exit(1);
}

/** 거짓으로 「계정 없음」을 답할 수 있는 곳. gmail 은 일부러 뺀다(구글은 정확하다). */
const KR_PORTALS = new Set([
  'naver.com', 'hanmail.net', 'daum.net', 'nate.com', 'kakao.com', 'korea.com', 'chol.com',
]);

async function fetchAll(endpoint) {
  const out = [];
  for (let offset = 0; offset < 60000; offset += 500) {
    const res = await fetch(
      `https://api.sendgrid.com/v3/suppression/${endpoint}?limit=500&offset=${offset}`,
      { headers: { Authorization: `Bearer ${KEY}` } },
    );
    if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

/** 차단 목록에서 지운다. SendGrid 는 한 번에 여러 개를 지울 수 있다. */
async function deleteFrom(endpoint, emails) {
  let done = 0;
  for (let i = 0; i < emails.length; i += 200) {
    const chunk = emails.slice(i, i + 200);
    const res = await fetch(`https://api.sendgrid.com/v3/suppression/${endpoint}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails: chunk }),
    });
    if (!res.ok) {
      console.error(`  ${endpoint} 삭제 실패 ${res.status}: ${(await res.text()).slice(0, 160)}`);
      continue;
    }
    done += chunk.length;
    process.stdout.write(`\r  ${endpoint}: ${done}/${emails.length}`);
  }
  if (emails.length) console.log('');
  return done;
}

const prisma = new PrismaClient();

// ── ① 잘못 꺼진 한국 포털 주소 찾기 ──────────────────────────────
const removalFile = path.join(process.cwd(), '.tmp', 'verified-removal.json');
let wrongOff = [];
if (fs.existsSync(removalFile)) {
  const { remove } = JSON.parse(fs.readFileSync(removalFile, 'utf-8'));
  wrongOff = remove
    .filter((x) => x.why.includes('계정 없음'))
    .filter((x) => KR_PORTALS.has(x.email.split('@')[1]?.toLowerCase()))
    .map((x) => x.email.toLowerCase());
} else {
  console.log('※ .tmp/verified-removal.json 이 없어 ① 은 건너뛴다.');
}
// 실제로 꺼져 있는 것만 (이미 켜져 있으면 손댈 필요 없다)
const offNow = wrongOff.length
  ? (await prisma.subscriber.findMany({
      where: { email: { in: wrongOff }, isActive: false },
      select: { email: true },
    })).map((s) => s.email)
  : [];

// ── ② 명부는 켜져 있는데 SendGrid 가 막고 있는 주소 찾기 ──────────
console.log('SendGrid 차단·반송 목록을 받는 중…');
const [blocks, bounces] = await Promise.all([fetchAll('blocks'), fetchAll('bounces')]);
const suppressed = new Map(); // email → 어느 목록에 있나
for (const b of blocks) suppressed.set((b.email || '').toLowerCase(), 'blocks');
for (const b of bounces) {
  const e = (b.email || '').toLowerCase();
  suppressed.set(e, suppressed.has(e) ? 'both' : 'bounces');
}

const active = await prisma.subscriber.findMany({
  where: { isActive: true },
  select: { email: true },
});
const activeSet = new Set(active.map((s) => s.email.toLowerCase()));

// 되살릴 전체 = ①(다시 켤 것) + ②(이미 켜져 있는데 막힌 것)
const targets = new Set([...offNow.map((e) => e.toLowerCase())]);
for (const e of activeSet) if (suppressed.has(e)) targets.add(e);

const inBlocks = [...targets].filter((e) => ['blocks', 'both'].includes(suppressed.get(e)));
const inBounces = [...targets].filter((e) => ['bounces', 'both'].includes(suppressed.get(e)));

console.log('');
console.log('─'.repeat(58));
console.log(`① 잘못 꺼진 한국 포털 주소   ${offNow.length.toLocaleString()}명 → 명부를 다시 켠다`);
console.log(`② 명부는 켜져 있는데 막힌 것 ${(targets.size - offNow.length).toLocaleString()}명`);
console.log(`   되살릴 주소 합계          ${targets.size.toLocaleString()}명`);
console.log(`   · 차단(blocks) 목록에서 제거  ${inBlocks.length.toLocaleString()}건`);
console.log(`   · 반송(bounces) 목록에서 제거 ${inBounces.length.toLocaleString()}건`);
console.log('─'.repeat(58));
console.log(`현재 활성 ${activeSet.size.toLocaleString()}명 → 되살린 뒤 ${(activeSet.size + offNow.length).toLocaleString()}명`);

if (!APPLY) {
  console.log('\n미리보기만 했다. 실제로 되살리려면 --apply 를 붙여라.');
  await prisma.$disconnect();
  process.exit(0);
}

// 되돌릴 근거를 먼저 남긴다
const backup = path.join(process.cwd(), '.tmp', 'revived-backup.json');
fs.writeFileSync(
  backup,
  JSON.stringify({ at: new Date().toISOString(), turnedOn: offNow, unsuppressed: [...targets] }, null, 2),
  'utf-8',
);

if (offNow.length) {
  const r = await prisma.subscriber.updateMany({
    where: { email: { in: offNow } },
    data: { isActive: true },
  });
  console.log(`\n명부를 다시 켠 주소: ${r.count.toLocaleString()}명`);
}

console.log('SendGrid 목록에서 빼는 중…');
const d1 = await deleteFrom('blocks', inBlocks);
const d2 = await deleteFrom('bounces', inBounces);

const after = await prisma.subscriber.count({ where: { isActive: true } });
console.log('');
console.log(`차단 목록 제거 ${d1.toLocaleString()}건 · 반송 목록 제거 ${d2.toLocaleString()}건`);
console.log(`활성 구독자: ${after.toLocaleString()}명`);
console.log(`되돌릴 근거: ${backup}`);
console.log('');
console.log('※ 진짜 없는 계정이면 다음 발송에서 다시 반송되어 목록에 되돌아간다.');
console.log('   내일 발송 뒤 scripts/audit-sendgrid-blocks.mjs 로 결과를 보면 된다.');

await prisma.$disconnect();
