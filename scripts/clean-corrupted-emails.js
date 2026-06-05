// 손상된 이메일 정리 — .푸(=.vn)·.co.k(=.co.kr)·mailto:·이중이메일·공백 등 교정
//   · 정상본이 이미 DB에 있으면 → 깨진 행 삭제(중복)
//   · 정상본이 없으면 → 깨진 행 이메일을 교정형으로 수정
// 2번째 이메일(:::, 공백 구분)은 리포트만 (자동 추가 안 함).
//
// 사용:
//   node scripts/clean-corrupted-emails.js            # dry-run
//   node scripts/clean-corrupted-emails.js --execute  # 실제 적용
//   node scripts/clean-corrupted-emails.js --execute --add-secondary  # 2번째 이메일도 신규 추가

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');
const ADD_SECONDARY = process.argv.includes('--add-secondary');
const STRICT = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

function candidates(raw) {
  let s = String(raw).replace(/mailto:/ig, '').replace(/[<>]/g, '');
  s = s.replace(/푸/g, 'vn'); // 푸 → vn
  const norm = (tok) => {
    let e = tok.trim().replace(/\s+/g, '');           // 내부 공백 제거
    e = e.replace(/^[.,;:]+|[.,;:]+$/g, '');           // 앞뒤 구두점 제거
    if (/@/.test(e) && /\.co\.k$/.test(e)) e += 'r';   // .co.k → .co.kr
    return e;
  };
  // 1) ::: 또는 공백으로 분리한 토큰 우선 (잡음 'hi cg' 등이 이메일에 붙는 것 방지)
  const out = [];
  for (const t of s.split(/:::|\s+/)) { const e = norm(t); if (STRICT.test(e) && !out.includes(e)) out.push(e); }
  // 2) 토큰에서 못 찾으면 통째(공백제거) — "hanmail .net" 도메인 내부 공백 케이스
  if (out.length === 0) { const e = norm(s); if (STRICT.test(e)) out.push(e); }
  return out;
}

async function withRetry(fn) { for (let a = 0; a < 6; a++) { try { return await fn(); } catch (e) { if (a === 5) throw e; await new Promise(r => setTimeout(r, 2500)); } } }

async function main() {
  console.log('='.repeat(64));
  console.log(`  손상 이메일 정리 ${EXECUTE ? '[실제 적용]' : '[DRY-RUN]'}`);
  console.log('='.repeat(64));
  const all = await withRetry(() => p.subscriber.findMany({ select: { id: true, email: true, category: true, company: true } }));
  const validSet = new Map(); // lower -> row
  for (const s of all) if (STRICT.test(s.email)) validSet.set(s.email.toLowerCase(), s);
  const bad = all.filter(s => !STRICT.test(s.email));

  const plan = [];
  for (const s of bad) {
    const cands = candidates(s.email);
    if (cands.length === 0) { plan.push({ s, action: 'manual', primary: null, secondary: [] }); continue; }
    const primary = cands[0], secondary = cands.slice(1);
    const twin = validSet.get(primary.toLowerCase());
    plan.push({ s, primary, secondary, action: twin ? 'delete' : 'update' });
  }

  const dels = plan.filter(x => x.action === 'delete');
  const upds = plan.filter(x => x.action === 'update');
  const man = plan.filter(x => x.action === 'manual');
  const secAll = plan.flatMap(x => x.secondary).filter((e, i, a) => a.indexOf(e) === i).filter(e => !validSet.has(e.toLowerCase()));

  console.log(`\n  [삭제 — 정상본 이미 존재] ${dels.length}건`);
  dels.forEach(x => console.log(`    ${x.s.email}  ⇒ del (정상본 ${x.primary})`));
  console.log(`\n  [수정 — 정상 쌍둥이 없음] ${upds.length}건`);
  upds.forEach(x => console.log(`    ${x.s.email}  ⇒ ${x.primary}`));
  if (man.length) { console.log(`\n  [수동검토] ${man.length}건`); man.forEach(x => console.log(`    ${x.s.email}`)); }
  console.log(`\n  [2번째 이메일 — DB에 없음 ${ADD_SECONDARY ? '→ 신규추가' : '(리포트만)'}] ${secAll.length}건`);
  secAll.forEach(e => console.log(`    ${e}`));

  if (!EXECUTE) { console.log('\n  [DRY-RUN] 변경 없음. 적용: --execute (2번째이메일 추가: --add-secondary)'); return; }

  let deleted = 0, updated = 0, added = 0;
  for (const x of dels) { await p.subscriber.delete({ where: { id: x.s.id } }); deleted++; }
  for (const x of upds) {
    try { await p.subscriber.update({ where: { id: x.s.id }, data: { email: x.primary } }); updated++; }
    catch (e) { // unique 충돌 시 정상본이 생긴 것 → 삭제
      await p.subscriber.delete({ where: { id: x.s.id } }); deleted++;
    }
  }
  if (ADD_SECONDARY) {
    for (const e of secAll) {
      try { await p.subscriber.create({ data: { email: e, isActive: true, category: 'general' } }); added++; } catch {}
    }
  }
  console.log(`\n  ✓ 완료: 삭제 ${deleted} · 수정 ${updated} · 2번째추가 ${added}`);
  const remain = (await p.subscriber.findMany({ select: { email: true } })).filter(s => !STRICT.test(s.email)).length;
  console.log(`  남은 비정상 이메일: ${remain}건`);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); }).finally(async () => await p.$disconnect());
