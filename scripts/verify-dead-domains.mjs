/**
 * 「받는 곳이 없다」는 판정을 **실제 DNS로 검증**한다.
 * =====================================================================
 * 왜 필요한가 (2026-08-28):
 *   SendGrid 가 남긴 사유만 믿고 명부를 지우려다 큰일 날 뻔했다.
 *   「받는 곳 없음」으로 분류된 657명 안에 **naver.com 51명 · gmail.com 37명**이
 *   들어 있었다. 네이버와 지메일이 없어졌을 리 없다.
 *
 *   그 사유(`unable to get mx info`)는 **받는 도메인이 죽었다는 뜻이 아니라,
 *   보내려던 그 순간 SendGrid 가 주소를 못 찾았다는 뜻**이다. 네트워크가
 *   잠깐 흔들려도 이렇게 남는다. 이걸 죽은 주소로 알고 지웠다면 멀쩡한
 *   구독자 100명 넘게 잘라낼 뻔했다.
 *
 * 그래서 여기서는 **우리가 직접 DNS 에 물어본다.**
 *   MX 기록이 있으면 그 도메인은 지금 메일을 받고 있다 → 남긴다.
 *   MX 도 A 기록도 없으면 그 도메인은 진짜 없다 → 뺀다.
 *
 * 사유별 처리 원칙:
 *   · "does not exist" / "user unknown" → 계정이 없다. **도메인과 무관하게 뺀다.**
 *   · "unable to get mx info"           → 도메인이 살아 있으면 **남긴다.**
 *   · "Access denied"(마이크로소프트)    → 받는 사람 문제가 아니라 **우리 발신 차단**. 남긴다.
 *
 * 이 스크립트도 **세기만 하고 아무것도 바꾸지 않는다.**
 * 쓰는 법: node scripts/verify-dead-domains.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';

dns.setServers(['8.8.8.8', '1.1.1.1']); // 회사 DNS 사정을 타지 않도록 공용 해석기를 쓴다

const SRC = path.join(process.cwd(), '.tmp', 'blocked-subscribers.json');
const data = JSON.parse(fs.readFileSync(SRC, 'utf-8'));

/** 사유가 "이 계정은 없다" 고 말하는가 — 도메인이 살아 있어도 이건 뺀다 */
function saysNoSuchAccount(reason = '') {
  const r = reason.toLowerCase();
  return (
    r.includes('does not exist') ||
    r.includes('user unknown') ||
    r.includes('no such user') ||
    r.includes('does not like recipient') ||
    r.includes('unknown user') ||
    r.includes('mailbox not found') ||
    r.includes('invalid recipient')
  );
}

/** 사유가 "우리(발신자)를 거부한다" 고 말하는가 — 받는 사람 잘못이 아니다 */
function saysSenderBlocked(reason = '') {
  const r = reason.toLowerCase();
  return r.includes('access denied') || r.includes('exosmtperror') || r.includes('aka.ms');
}

const all = data.dead || [];
const domains = [...new Set(all.map((x) => x.email.split('@')[1]))];
console.log(`「받는 곳 없음」 ${all.length}명 · 도메인 ${domains.length}종`);
console.log('DNS 에 직접 물어보는 중…');

/** 도메인이 지금 메일을 받고 있는가 */
async function domainAlive(d) {
  try {
    const mx = await dns.resolveMx(d);
    if (mx && mx.length) return true;
  } catch {
    /* MX 없음 — A 기록으로도 메일을 받을 수 있으므로 한 번 더 본다 */
  }
  try {
    const a = await dns.resolve4(d);
    return !!(a && a.length);
  } catch {
    return false;
  }
}

const alive = new Map();
const CONC = 20;
for (let i = 0; i < domains.length; i += CONC) {
  const batch = domains.slice(i, i + CONC);
  const res = await Promise.all(batch.map((d) => domainAlive(d).catch(() => false)));
  batch.forEach((d, k) => alive.set(d, res[k]));
  process.stdout.write(`\r  ${Math.min(i + CONC, domains.length)}/${domains.length}`);
}
console.log('');

const remove = []; // 명부에서 뺄 것
const keep = []; // 남길 것
for (const x of all) {
  const d = x.email.split('@')[1];
  if (saysNoSuchAccount(x.reason)) {
    remove.push({ ...x, why: '계정 없음(수신 서버가 그렇게 답함)' });
  } else if (!alive.get(d)) {
    remove.push({ ...x, why: '도메인 자체가 없음(DNS 확인)' });
  } else if (saysSenderBlocked(x.reason)) {
    keep.push({ ...x, why: '받는 사람 문제 아님 — 우리 발신이 거부됨' });
  } else {
    keep.push({ ...x, why: '도메인 살아 있음 — 그때만 조회 실패' });
  }
}

const deadDomains = domains.filter((d) => !alive.get(d));
console.log('');
console.log('─'.repeat(60));
console.log(`빼야 할 주소   ${remove.length}명`);
console.log(`남겨야 할 주소 ${keep.length}명  ← 그대로 지웠으면 잘라낼 뻔한 사람들`);
console.log('─'.repeat(60));

const byWhy = (arr) =>
  arr.reduce((m, x) => ((m[x.why] = (m[x.why] || 0) + 1), m), {});
console.log('\n[빼는 사유]');
for (const [k, v] of Object.entries(byWhy(remove))) console.log(`  ${v}  ${k}`);
console.log('\n[남기는 사유]');
for (const [k, v] of Object.entries(byWhy(keep))) console.log(`  ${v}  ${k}`);
console.log(`\n실제로 없어진 도메인 ${deadDomains.length}종 (예: ${deadDomains.slice(0, 8).join(', ')})`);

const out = path.join(process.cwd(), '.tmp', 'verified-removal.json');
fs.writeFileSync(out, JSON.stringify({ remove, keep, deadDomains }, null, 2), 'utf-8');
console.log(`\n목록: ${out}`);
console.log('※ 세기만 했다. 명부는 그대로다.');
