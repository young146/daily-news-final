const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const latestLog = await prisma.emailSendLog.findFirst({
    orderBy: { sentAt: 'desc' }
  });
  
  if (!latestLog) {
      console.log('No recent logs found.');
      return;
  }
  
  console.log(`Analyzing log from ${latestLog.sentAt}`);
  
  // Find all distinct emails that failed with a bounce/reject error
  // Specifically errors like "553-5.1.3", "not a valid RFC"
  const failedDetails = await prisma.emailSendDetail.findMany({
    where: { 
      logId: latestLog.id, 
      status: 'failed',
      NOT: {
          errorMsg: {
              contains: '모든 계정 한도 초과 또는 사용 불가 상태'
          }
      }
    },
    select: { email: true, errorMsg: true }
  });

  const uniqueFailedEmails = [...new Set(failedDetails.map(d => d.email))];
  
  console.log(`Found ${uniqueFailedEmails.length} distinct emails that failed permanently (excl. quota limit).`);
  
  if (uniqueFailedEmails.length > 0) {
      const first5 = uniqueFailedEmails.slice(0, 5);
      console.log(`Sample failures: ${first5.join(', ')}`);
      
      const res = await prisma.subscriber.updateMany({
         where: { email: { in: uniqueFailedEmails } },
         data: { isActive: false }
      });
      console.log(`Deactivated ${res.count} subscribers in the database.`);
  } else {
      console.log('No permanent failure emails found in this run.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
