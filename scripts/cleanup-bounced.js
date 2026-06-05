// 바운스/비활성 구독자 정리 — 백업 후 DB에서 삭제
//
// 삭제 대상(바운스 마스터 집합):
//   ① isActive=false (이미 발송제외된 바운스/수신거부)
//   ② bounced-list.txt 에 있으면서 현재 active 인 이메일 (다시 살아난 알려진 바운스)
//
// 사용:
//   node scripts/cleanup-bounced.js            # dry-run + 백업만 (.tmp/merge/deleted_backup_*.csv)
//   node scripts/cleanup-bounced.js --execute  # 백업 후 실제 삭제
//
// 안전: 삭제 전 항상 전체 행을 .tmp/merge/ 에 CSV 백업(복구용).

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');
const OUT = path.join('.tmp', 'merge');
const BATCH = 500;

function csvEsc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  console.log('='.repeat(60));
  console.log(`  바운스/비활성 구독자 정리 ${EXECUTE ? '[실제 삭제]' : '[DRY-RUN + 백업]'}`);
  console.log('='.repeat(60));

  // bounced-list.txt 로드
  let bounced = new Set();
  const blPath = path.join(__dirname, '..', 'bounced-list.txt');
  if (fs.existsSync(blPath)) {
    bounced = new Set(fs.readFileSync(blPath, 'utf-8').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean));
  }
  console.log(`  bounced-list.txt: ${bounced.size}건`);

  // 삭제 대상 수집: isActive=false 전부 + bounced-list active
  const inactive = await prisma.subscriber.findMany({
    where: { isActive: false },
    select: { id: true, email: true, company: true, name: true, phone: true, isActive: true, isCustomer: true, createdAt: true },
  });
  let activeBad = [];
  if (bounced.size) {
    const arr = [...bounced];
    for (let i = 0; i < arr.length; i += 500) {
      const chunk = arr.slice(i, i + 500);
      const r = await prisma.subscriber.findMany({
        where: { email: { in: chunk }, isActive: true },
        select: { id: true, email: true, company: true, name: true, phone: true, isActive: true, isCustomer: true, createdAt: true },
      });
      activeBad.push(...r);
    }
  }
  // 합치고 중복 제거
  const byId = new Map();
  for (const r of [...inactive, ...activeBad]) byId.set(r.id, r);
  const targets = [...byId.values()];

  // 배치 구분용 시각 경계 (오늘 자정)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTargets = targets.filter(t => t.createdAt >= today);
  console.log('-'.repeat(60));
  console.log(`  삭제 대상 합계        : ${targets.length}건`);
  console.log(`    ├ isActive=false    : ${inactive.length}`);
  console.log(`    └ active+바운스명단  : ${activeBad.length} (다시 살아난 바운스)`);
  console.log(`  그중 오늘(6/5) 추가분  : ${todayTargets.length}건 (이번 병합으로 들어왔다 삭제됨)`);
  console.log(`    └ 그중 고객(isCustomer): ${todayTargets.filter(t => t.isCustomer).length}`);

  // 백업 작성 (항상)
  const header = ['id', 'email', 'company', 'name', 'phone', 'isActive', 'isCustomer', 'createdAt'];
  const lines = [header.join(',')];
  for (const t of targets) {
    lines.push([t.id, t.email, t.company, t.name, t.phone, t.isActive, t.isCustomer, t.createdAt.toISOString()].map(csvEsc).join(','));
  }
  const backupPath = path.join(OUT, 'deleted_bounced_backup.csv');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(backupPath, '﻿' + lines.join('\n'));
  console.log(`  백업 작성: ${backupPath} (${targets.length}건, 복구용)`);

  if (!EXECUTE) {
    console.log('\n  [DRY-RUN] 삭제 안 함. 실제 삭제하려면 --execute 추가.');
    return;
  }

  const ids = targets.map(t => t.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const r = await prisma.subscriber.deleteMany({ where: { id: { in: chunk } } });
    deleted += r.count;
    console.log(`    [${i + chunk.length}/${ids.length}] -${r.count} (누적 ${deleted})`);
  }
  const total = await prisma.subscriber.count();
  const active = await prisma.subscriber.count({ where: { isActive: true } });
  console.log('\n' + '='.repeat(60));
  console.log(`  ✓ 삭제 완료: ${deleted}건 / 남은 구독자 ${total} (활성 ${active})`);
  console.log('='.repeat(60));
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());
