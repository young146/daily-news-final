const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  let output = '';
  const latestLogs = await prisma.emailSendLog.findMany({
    orderBy: { sentAt: 'desc' },
    take: 3
  });
  
  if (latestLogs.length === 0) return console.log('No logs found.');
  
  for (const log of latestLogs) {
      output += '----------------------------------------------------\n';
      output += `sentAt: ${log.sentAt.toLocaleString()} (VN Time: ${log.sentAt.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })})\n`;
      output += `method: ${log.method}, total: ${log.total}, succeeded: ${log.succeeded}, failed: ${log.failed}\n`;
      output += `note: ${log.note}\n`;
      
      const errors = await prisma.emailSendDetail.groupBy({
        by: ['errorMsg'],
        where: { 
          logId: log.id,
          status: 'failed'
        },
        _count: {
          errorMsg: true
        }
      });
      output += 'Errors Grouped:\n';
      errors.forEach(e => {
        output += `- Count: ${e._count.errorMsg} -> Msg: ${e.errorMsg?.substring(0, 100)}\n`;
      });
  }
  fs.writeFileSync('tmp-errors.txt', output);
  console.log('Saved to tmp-errors.txt');
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
