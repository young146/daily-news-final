import prisma from "../lib/prisma.js";

async function checkCardNewsImages() {
  try {
    console.log("🔍 카드 뉴스 대상 이미지 확인 중...\n");

    // isCardNews = true인 뉴스들 조회
    const cardNewsList = await prisma.newsItem.findMany({
      where: {
        isCardNews: true,
        status: 'PUBLISHED',
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 10,
      select: {
        id: true,
        title: true,
        translatedTitle: true,
        isTopNews: true,
        imageUrl: true,
        wordpressImageUrl: true,
        wordpressMediaId: true,
        publishedAt: true,
      }
    });

    console.log(`총 ${cardNewsList.length}개의 카드 뉴스 대상 발견\n`);

    cardNewsList.forEach((news, index) => {
      console.log(`\n[${index + 1}] ${news.isTopNews ? '⭐ 탑뉴스' : '📰 일반뉴스'}`);
      console.log(`제목: ${news.translatedTitle || news.title}`);
      console.log(`ID: ${news.id}`);
      console.log(`발행일: ${news.publishedAt?.toISOString() || '없음'}`);
      console.log(`원본 이미지 URL: ${news.imageUrl || '❌ 없음'}`);
      console.log(`워드프레스 이미지 URL: ${news.wordpressImageUrl || '❌ 없음'}`);
      console.log(`워드프레스 미디어 ID: ${news.wordpressMediaId || '❌ 없음'}`);
      
      if (!news.wordpressImageUrl) {
        console.log(`⚠️ WARNING: WordPress 이미지가 없습니다!`);
      }
    });

    console.log("\n✅ 확인 완료");
  } catch (error) {
    console.error("❌ 오류:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCardNewsImages();

