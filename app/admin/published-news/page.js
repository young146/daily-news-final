import prisma from "@/lib/prisma";
import PublishedNewsList from "./published-news-list";

export const dynamic = "force-dynamic"; // ✅ Vercel에서 캐싱 방지, 항상 최신 데이터 가져오기

// 오늘 시작/끝 — 베트남 시간대 (모든 조회에 공통 사용)
function getTodayRangeVN() {
  const now = new Date();
  const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const todayStart = new Date(`${vnDateStr}T00:00:00+07:00`);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return { todayStart, todayEnd };
}

// 페북 게시 대기 카드 — 오늘 cardImageUrl 저장됐고 아직 게시 안 한 뉴스 (보통 1개).
// publish-card-news 호출 시 자동으로 cardImageUrl 저장. /api/fb-publish 호출 시 isSentSNS=true.
async function getFacebookReadyNews() {
  const { todayStart, todayEnd } = getTodayRangeVN();
  return await prisma.newsItem.findMany({
    where: {
      cardImageUrl: { not: null },
      OR: [
        { isSentSNS: false },
        { isSentSNS: true }, // 게시 완료된 것도 표시 (permalink 확인용)
      ],
      updatedAt: { gte: todayStart, lt: todayEnd }, // 오늘 준비된 것만
    },
    orderBy: { updatedAt: "desc" },
    take: 5, // 최대 5개 (보통 1개)
    select: {
      id: true,
      title: true,
      translatedTitle: true,
      cardImageUrl: true,
      isSentSNS: true,
      facebookPermalink: true,
      updatedAt: true,
    },
  });
}

async function getPublishedNews() {
  // 오늘 발행된 뉴스만 가져오기 (베트남 시간대 기준)
  const { todayStart, todayEnd } = getTodayRangeVN();

  const publishedNews = await prisma.newsItem.findMany({
    where: {
      isPublishedMain: true,
      publishedAt: {
        gte: todayStart,
        lt: todayEnd
      },
      wordpressUrl: { not: null }
    },
    orderBy: {
      publishedAt: "desc"
    },
    select: {
      id: true,
      title: true,
      translatedTitle: true,
      source: true,
      category: true,
      publishedAt: true,
      wordpressUrl: true,
      translationStatus: true,
      translatedContent: true,
      isTopNews: true
    }
  });

  // 카테고리별로 그룹화
  const categoryOrder = ['Economy', 'Society', 'Politics', 'Culture', 'International', 'Korea-Vietnam', 'Community', 'Travel', 'Health', 'Food'];
  const groupedNews = {};

  publishedNews.forEach(news => {
    const category = news.category || 'Other';
    if (!groupedNews[category]) {
      groupedNews[category] = [];
    }
    groupedNews[category].push(news);
  });

  // 카테고리 순서대로 정렬
  const sortedCategories = categoryOrder.filter(cat => groupedNews[cat]);
  const otherCategories = Object.keys(groupedNews).filter(cat => !categoryOrder.includes(cat));
  const finalCategories = [...sortedCategories, ...otherCategories];

  return { groupedNews, categories: finalCategories, totalCount: publishedNews.length };
}

export default async function PublishedNewsPage() {
  const [{ groupedNews, categories, totalCount }, subscriberCount, fbReadyNews] = await Promise.all([
    getPublishedNews(),
    prisma.subscriber.count({ where: { isActive: true } }),
    getFacebookReadyNews(),
  ]);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">발행된 뉴스 관리</h1>
        <p className="text-sm text-gray-600">
          오늘 발행된 뉴스를 카테고리별로 관리합니다. (총 {totalCount}개)
        </p>
      </div>

      <PublishedNewsList
        groupedNews={groupedNews}
        categories={categories}
        subscriberCount={subscriberCount}
        fbReadyNews={fbReadyNews}
      />
    </div>
  );
}

