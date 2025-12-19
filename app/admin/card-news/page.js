import { PrismaClient } from "@prisma/client";
import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";
import CardNewsSimple from "./CardNewsSimple";

const prisma = new PrismaClient();

async function getData() {
  // 베트남 시간대 기준으로 오늘 날짜 계산
  const now = new Date();
  const vietnamTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  );
  const today = new Date(
    vietnamTime.getFullYear(),
    vietnamTime.getMonth(),
    vietnamTime.getDate()
  );
  today.setHours(0, 0, 0, 0);

  // 1. 탑뉴스 리스트 가져오기 (최대 2개) - 발행된 뉴스 중에서 isTopNews=true인 것만
  const topNewsList = await prisma.newsItem.findMany({
    where: {
      isTopNews: true,
      status: 'PUBLISHED', // 발행된 뉴스만
    },
    orderBy: [
      { updatedAt: "desc" },
      { publishedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 2,
  });

  // 2. 탑뉴스가 아닌 발행된 뉴스 중에서 최신 뉴스 가져오기 (최대 5개, 탑뉴스 제외)
  const topNewsIds = topNewsList.map(n => n.id);
  const recentNewsList = await prisma.newsItem.findMany({
    where: {
      id: { notIn: topNewsIds.length > 0 ? topNewsIds : [] },
      isTopNews: false, // 탑뉴스가 아닌 것만
      isPublishedMain: true, // 발행된 뉴스만
      status: 'PUBLISHED', // 발행된 뉴스만
      OR: [
        { publishedAt: { gte: today } },
        { publishedAt: null },
      ],
    },
    orderBy: [
      { publishedAt: "desc" },
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 5,
  });

  // 3. 전체 뉴스 리스트 (탑뉴스 + 최신 뉴스, 최대 5개)
  const allNewsList = [
    ...topNewsList,
    ...recentNewsList.filter(n => !topNewsIds.includes(n.id))
  ].slice(0, 5);

  // 4. 기본 선택 뉴스 (탑뉴스가 있으면 첫 번째 탑뉴스, 없으면 첫 번째 최신 뉴스)
  const defaultTopNews = topNewsList.length > 0 
    ? topNewsList[0]
    : (recentNewsList.length > 0 ? recentNewsList[0] : null);

  // 5. fallback 여부 확인
  const isUsingFallback = topNewsList.length === 0 && recentNewsList.length > 0;
  const fallbackReason = isUsingFallback 
    ? "탑뉴스가 지정되지 않아 최신 뉴스를 사용합니다."
    : null;

  const weather = await getSeoulWeather();
  const rates = await getExchangeRates();

  return { 
    topNews: defaultTopNews, 
    topNewsList, 
    allNewsList, // 전체 뉴스 리스트 (선택용)
    isUsingFallback,
    fallbackReason,
    weather, 
    rates 
  };
}

export default async function CardNewsPreviewPage() {
  const data = await getData();
  return <CardNewsSimple data={data} />;
}
