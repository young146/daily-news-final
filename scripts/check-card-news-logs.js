const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 최근 카드 뉴스 로그 조회 중...\n');
    
    // 카드 뉴스 관련 로그만 조회
    const logs = await prisma.crawlerLog.findMany({
      where: {
        message: {
          contains: '카드뉴스'
        }
      },
      orderBy: { runAt: 'desc' },
      take: 10
    });
    
    console.log(`총 ${logs.length}개의 카드 뉴스 로그 발견\n`);
    
    logs.forEach((log, index) => {
      console.log(`\n[${index + 1}] ${log.status} - ${new Date(log.runAt).toLocaleString('ko-KR')}`);
      console.log(`메시지: ${log.message || '없음'}`);
      console.log(`발견된 항목: ${log.itemsFound}`);
      
      if (log.errorDetails) {
        try {
          const errorDetails = JSON.parse(log.errorDetails);
          console.log(`에러 상세:`);
          console.log(JSON.stringify(errorDetails, null, 2));
        } catch (e) {
          console.log(`에러 상세 (원문): ${log.errorDetails}`);
        }
      }
      console.log('─'.repeat(80));
    });
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

