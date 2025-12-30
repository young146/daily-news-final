import prisma from "@/lib/prisma";
import PublishedNewsList from "./published-news-list";

async function getPublishedNews() {
  // 오늘 발행된 뉴스만 가져오기 (베트남 시간대 기준)
  const tz = 'Asia/Ho_Chi_Minh';
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  today.setHours(0, 0, 0, 0);
  
  const todayStart = new Date(today.toISOString());
  
  const publishedNews = await prisma.newsItem.findMany({
    where: {
      isPublishedMain: true,
      publishedAt: { gte: todayStart },
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
  const { groupedNews, categories, totalCount } = await getPublishedNews();

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">발행된 뉴스 관리</h1>
        <p className="text-sm text-gray-600">
          오늘 발행된 뉴스를 카테고리별로 관리합니다. (총 {totalCount}개)
        </p>
      </div>

      <PublishedNewsList groupedNews={groupedNews} categories={categories} />
    </div>
  );
}

