const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const latestLog = await prisma.emailSendLog.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  
  if (!latestLog) return console.log('no logs');
  console.log(JSON.stringify(latestLog, null, 2));
  
  const details = await prisma.emailSendDetail.groupBy({
    by: ['status', 'errorMsg'],
    _count: {
      email: true
    },
    where: {
      logId: latestLog.id
    }
  });
  console.log(JSON.stringify(details, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
