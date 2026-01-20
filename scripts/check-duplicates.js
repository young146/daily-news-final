const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicates() {
  try {
    console.log('🔍 오늘 발행된 중복 뉴스 확인 중...\n');
    
    // 오늘 발행된 뉴스
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const publishedNews = await prisma.newsItem.findMany({
      where: {
        status: 'PUBLISHED',
        publishedAt: { gte: today }
      },
      select: {
        id: true,
        title: true,
        translatedTitle: true,
        originalUrl: true,
        wordpressUrl: true,
        source: true,
        publishedAt: true
      },
      orderBy: { publishedAt: 'asc' }
    });
    
    console.log(`📊 오늘 발행된 뉴스: ${publishedNews.length}개\n`);
    
    // originalUrl로 그룹화하여 중복 찾기
    const urlGroups = {};
    publishedNews.forEach(news => {
      if (!urlGroups[news.originalUrl]) {
        urlGroups[news.originalUrl] = [];
      }
      urlGroups[news.originalUrl].push(news);
    });
    
    // 중복된 것만 필터링
    const duplicates = Object.entries(urlGroups).filter(([url, items]) => items.length > 1);
    
    if (duplicates.length === 0) {
      console.log('✅ 중복 발행된 뉴스가 없습니다!');
    } else {
      console.log(`❌ 중복 발행된 뉴스: ${duplicates.length}개\n`);
      
      duplicates.forEach(([originalUrl, items]) => {
        console.log('─'.repeat(100));
        console.log(`📰 제목: ${items[0].translatedTitle || items[0].title}`);
        console.log(`🔗 원문 URL: ${originalUrl}`);
        console.log(`📌 소스: ${items[0].source}`);
        console.log(`\n중복 발행 내역 (${items.length}개):`);
        
        items.forEach((item, index) => {
          console.log(`\n  [${index + 1}] ID: ${item.id}`);
          console.log(`      발행 시간: ${item.publishedAt.toISOString()}`);
          console.log(`      WordPress URL: ${item.wordpressUrl}`);
        });
        console.log('\n');
      });
      
      console.log('─'.repeat(100));
      console.log(`\n📊 통계:`);
      console.log(`   총 중복 뉴스: ${duplicates.length}개`);
      console.log(`   총 중복 포스트: ${duplicates.reduce((sum, [_, items]) => sum + items.length, 0)}개`);
      
      // 소스별 중복 통계
      const sourceStats = {};
      duplicates.forEach(([_, items]) => {
        const source = items[0].source;
        sourceStats[source] = (sourceStats[source] || 0) + 1;
      });
      
      console.log(`\n   소스별 중복:`);
      Object.entries(sourceStats).sort((a, b) => b[1] - a[1]).forEach(([source, count]) => {
        console.log(`   - ${source}: ${count}개`);
      });
    }
    
  } catch (error) {
    console.error('❌ 오류:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();
