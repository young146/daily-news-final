/**
 * 죽은 주소를 명부에서 뺀다.
 * =====================================================================
 * 무엇을 빼나: `verify-dead-domains.mjs` 가 **DNS 로 직접 확인해** 걸러낸 것만.
 *   · 수신 서버가 "그런 계정 없다" 고 답한 주소
 *   · 도메인 자체가 사라진 주소 (예: chol.com, vnm.fujixerox.com)
 *
 * 무엇을 안 빼나 (중요):
 *   · `unable to get mx info` 뿐인데 도메인은 멀쩡한 주소 → 그때만 조회가 실패한 것
 *   · 마이크로소프트가 "Access denied" 한 주소 → **받는 사람 잘못이 아니라 우리 발신이 막힌 것**
 *   · 스팸으로 거부된 주소 → 우리 발신 평판 문제다. 고치면 다시 도달한다.
 *   이들을 빼면 **멀쩡한 독자를 우리 손으로 잘라내는 것**이 된다.
 *
 * 왜 지우지 않고 **끄나**:
 *   결과는 같다 — 메일이 안 나간다. 다만 지워 버리면 나중에 "이 사람 왜 빠졌지"
 *   를 확인할 길이 없고, 잘못 뺐을 때 되돌릴 수도 없다. 끄는 것은 언제든
 *   되돌릴 수 있고, 그 사람이 다시 신청하면 되살아나는 흐름이 이미 있다.
 *
 * 쓰는 법:
 *   node scripts/deactivate-dead-subscribers.mjs           미리보기(아무것도 안 바꿈)
 *   node scripts/deactivate-dead-subscribers.mjs --apply   실제로 끈다
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const SRC = path.join(process.cwd(), '.tmp', 'verified-removal.json');

if (!fs.existsSync(SRC)) {
  console.error('먼저 scripts/verify-dead-domains.mjs 를 돌려라.');
  process.exit(1);
}

const { remove } = JSON.parse(fs.readFileSync(SRC, 'utf-8'));
const emails = [...new Set(remove.map((x) => x.email.toLowerCase()))];

const prisma = new PrismaClient();

const before = await prisma.subscriber.count({ where: { isActive: true } });
// 지금도 살아 있는 것만 센다 — 이미 꺼진 주소를 실적으로 잡으면 안 된다
const targets = await prisma.subscriber.findMany({
  where: { email: { in: emails }, isActive: true },
  select: { email: true },
});

console.log(`활성 명부        ${before.toLocaleString()}명`);
console.log(`끌 대상          ${targets.length.toLocaleString()}명`);
console.log(`끄고 나면        ${(before - targets.length).toLocaleString()}명`);
console.log('');
const byWhy = remove.reduce((m, x) => ((m[x.why] = (m[x.why] || 0) + 1), m), {});
for (const [k, v] of Object.entries(byWhy)) console.log(`  ${v}  ${k}`);

if (!APPLY) {
  console.log('\n미리보기만 했다. 실제로 끄려면 --apply 를 붙여라.');
  await prisma.$disconnect();
  process.exit(0);
}

// 끄기 직전 상태를 남긴다 — 되돌려야 할 때 이 파일이 유일한 근거가 된다
const backup = path.join(process.cwd(), '.tmp', 'deactivated-backup.json');
fs.writeFileSync(
  backup,
  JSON.stringify({ at: new Date().toISOString(), emails: targets.map((t) => t.email) }, null, 2),
  'utf-8',
);

const res = await prisma.subscriber.updateMany({
  where: { email: { in: targets.map((t) => t.email) } },
  data: { isActive: false },
});

const after = await prisma.subscriber.count({ where: { isActive: true } });
console.log(`\n${res.count.toLocaleString()}명을 껐다.`);
console.log(`활성 명부 ${before.toLocaleString()} → ${after.toLocaleString()}명`);
console.log(`되돌릴 근거: ${backup}`);

await prisma.$disconnect();
