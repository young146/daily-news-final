import { PrismaClient } from "@prisma/client";
import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";
import CardNewsSimple from "./CardNewsSimple";

export const dynamic = "force-dynamic"; // ✅ Vercel에서 캐싱 방지, 항상 최신 데이터 가져오기

const prisma = new PrismaClient();

async function getData() {
  // isCardNews = true인 뉴스들만 가져옴 (발행된 뉴스 중)

  // 1. isCardNews = true인 탑뉴스 가져오기 (최대 2개)
  const topNewsList = await prisma.newsItem.findMany({
    where: {
      isTopNews: true,
      status: "PUBLISHED",
      isCardNews: true, // ✅ 카드 뉴스로 표시된 것만
    },
    orderBy: {
      publishedAt: "desc",
    },
    take: 2,
  });

  // 2. isCardNews = true인 일반 뉴스 가져오기 (최대 3개, 탑뉴스 제외)
  const topNewsIds = topNewsList.map((n) => n.id);
  const recentNewsList = await prisma.newsItem.findMany({
    where: {
      id: { notIn: topNewsIds.length > 0 ? topNewsIds : [] },
      isTopNews: false,
      status: "PUBLISHED",
      isCardNews: true, // ✅ 카드 뉴스로 표시된 것만
    },
    orderBy: {
      publishedAt: "desc",
    },
    take: 3,
  });

  // 3. 전체 뉴스 리스트 (탑뉴스 + 일반 뉴스)
  const allNewsList = [...topNewsList, ...recentNewsList].slice(0, 5);

  // 4. 기본 선택 뉴스
  const defaultTopNews =
    topNewsList.length > 0
      ? topNewsList[0]
      : recentNewsList.length > 0
      ? recentNewsList[0]
      : null;

  // 5. fallback 여부 확인
  const isUsingFallback = topNewsList.length === 0 && recentNewsList.length > 0;
  const fallbackReason = isUsingFallback
    ? "탑뉴스가 지정되지 않아 최신 뉴스를 사용합니다."
    : null;

  const weather = await getSeoulWeather();
  const rates = await getExchangeRates();

  console.log(
    `[CardNews Page] isCardNews=true 뉴스: Top=${topNewsList.length}, Regular=${recentNewsList.length}, Total=${allNewsList.length}`
  );

  return {
    topNews: defaultTopNews,
    topNewsList,
    allNewsList,
    isUsingFallback,
    fallbackReason,
    weather,
    rates,
  };
}

export default async function CardNewsPreviewPage() {
  const data = await getData();
  return <CardNewsSimple data={data} />;
}
