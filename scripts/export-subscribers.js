// 구독자 전체를 CSV로 export — kocham 이메일 리스트 비교용
// 실행: node scripts/export-subscribers.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function exportSubscribers() {
  const subs = await prisma.subscriber.findMany({
    select: {
      email: true,
      company: true,
      name: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = 'email,company,name,phone,isActive,createdAt\n';
  const lines = subs.map(s =>
    [s.email, s.company, s.name, s.phone, s.isActive, s.createdAt.toISOString()]
      .map(escape).join(',')
  );

  // utf-8-sig (BOM) for Excel compatibility
  fs.writeFileSync('subscribers_export.csv', '﻿' + header + lines.join('\n'));

  const active = subs.filter(s => s.isActive).length;
  const inactive = subs.length - active;
  console.log(`총 ${subs.length}명 export 완료 (활성 ${active} / 비활성 ${inactive})`);
  console.log('파일: subscribers_export.csv');
}

exportSubscribers()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());
