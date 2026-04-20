/**
 * deactivate-suppression-bounces.js
 *
 * SendGrid에서 export한 suppression_bounces CSV 파일을 읽어
 * 해당 이메일을 Subscriber 테이블에서 isActive = false 로 변경합니다.
 *
 * Usage: node scripts/deactivate-suppression-bounces.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  // CSV 파일 경로
  const csvPath = path.join(__dirname, '..', 'suppression_bounces (1).csv');
  const raw = fs.readFileSync(csvPath, 'utf-8');

  // 헤더: status,reason,email,created — email은 3번째 컬럼(index 2)
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  const header = lines[0]; // 첫 줄은 헤더 스킵

  const bouncedEmails = [];
  for (let i = 1; i < lines.length; i++) {
    // CSV 파싱: reason 필드에 쉼표가 포함된 경우가 있어 마지막 2개 컬럼을 역방향으로 파싱
    const line = lines[i];
    // email은 마지막에서 두 번째 컬럼 (created가 마지막)
    const lastComma = line.lastIndexOf(',');
    const withoutCreated = line.substring(0, lastComma); // created 제거
    const secondLastComma = withoutCreated.lastIndexOf(',');
    const email = withoutCreated.substring(secondLastComma + 1).trim().toLowerCase().replace(/"/g, '');
    if (email && email.includes('@')) {
      bouncedEmails.push(email);
    }
  }

  console.log(`📄 CSV에서 추출된 바운스 이메일: ${bouncedEmails.length}개`);
  console.log(`   샘플: ${bouncedEmails.slice(0, 5).join(', ')}`);

  // DB에서 활성 상태인 매칭 구독자 확인
  const activeMatches = await prisma.subscriber.findMany({
    where: {
      email: { in: bouncedEmails, mode: 'insensitive' },
      isActive: true
    },
    select: { email: true }
  });

  console.log(`\n🔍 현재 활성 상태 중 바운스 매칭: ${activeMatches.length}개`);

  if (activeMatches.length === 0) {
    console.log('✅ 비활성화할 구독자가 없습니다. (이미 처리되었거나 DB에 없음)');
    return;
  }

  console.log(`   대상: ${activeMatches.map(s => s.email).join(', ')}`);

  // 비활성화 실행
  const result = await prisma.subscriber.updateMany({
    where: {
      email: { in: bouncedEmails, mode: 'insensitive' },
      isActive: true
    },
    data: { isActive: false }
  });

  console.log(`\n✅ 완료! ${result.count}개 구독자를 비활성화했습니다.`);
}

main()
  .catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
