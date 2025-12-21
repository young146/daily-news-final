import { PrismaClient } from "@prisma/client";
import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";
import CardNewsSimple from "./CardNewsSimple";

const prisma = new PrismaClient();

async function getData() {
  // 발행 행위(batch) 기반: 가장 최근 발행된 뉴스들의 배치를 가져옴

  // 1. 가장 최근에 발행된 뉴스의 시간을 찾기
  const latestPublished = await prisma.newsItem.findFirst({
    where: {
      status: "PUBLISHED",
      publishedAt: { not: null },
    },
    orderBy: {
      publishedAt: "desc",
    },
    select: {
      publishedAt: true,
    },
  });

  if (!latestPublished) {
    // 발행된 뉴스가 없음
    const weather = await getSeoulWeather();
    const rates = await getExchangeRates();

    return {
      topNews: null,
      topNewsList: [],
      allNewsList: [],
      isUsingFallback: false,
      fallbackReason: "발행된 뉴스가 없습니다.",
      weather,
      rates,
    };
  }

  // 2. 가장 최근 발행 시간 기준으로 ±30분 이내를 같은 배치로 간주
  const batchTime = new Date(latestPublished.publishedAt);
  const batchStartTime = new Date(batchTime.getTime() - 30 * 60 * 1000); // 30분 전
  const batchEndTime = new Date(batchTime.getTime() + 30 * 60 * 1000); // 30분 후

  console.log(`[CardNews Page] Latest batch time: ${batchTime.toISOString()}`);
  console.log(
    `[CardNews Page] Batch window: ${batchStartTime.toISOString()} ~ ${batchEndTime.toISOString()}`
  );

  // 3. 이 배치 시간대에 발행된 탑뉴스만 가져오기 (최대 2개)
  const topNewsList = await prisma.newsItem.findMany({
    where: {
      isTopNews: true,
      status: "PUBLISHED",
      publishedAt: {
        gte: batchStartTime,
        lte: batchEndTime,
      },
    },
    orderBy: {
      publishedAt: "desc",
    },
    take: 2,
  });

  // 4. 이 배치 시간대에 발행된 일반 뉴스 가져오기 (최대 3개, 탑뉴스 제외)
  const topNewsIds = topNewsList.map((n) => n.id);
  const recentNewsList = await prisma.newsItem.findMany({
    where: {
      id: { notIn: topNewsIds.length > 0 ? topNewsIds : [] },
      isTopNews: false,
      status: "PUBLISHED",
      publishedAt: {
        gte: batchStartTime,
        lte: batchEndTime,
      },
    },
    orderBy: {
      publishedAt: "desc",
    },
    take: 3,
  });

  // 5. 전체 뉴스 리스트 (탑뉴스 + 일반 뉴스, 최대 5개)
  const allNewsList = [...topNewsList, ...recentNewsList].slice(0, 5);

  // 6. 기본 선택 뉴스
  const defaultTopNews =
    topNewsList.length > 0
      ? topNewsList[0]
      : recentNewsList.length > 0
      ? recentNewsList[0]
      : null;

  // 7. fallback 여부 확인
  const isUsingFallback = topNewsList.length === 0 && recentNewsList.length > 0;
  const fallbackReason = isUsingFallback
    ? "탑뉴스가 지정되지 않아 최신 뉴스를 사용합니다."
    : null;

  const weather = await getSeoulWeather();
  const rates = await getExchangeRates();

  console.log(
    `[CardNews Page] Selected from latest batch: Top=${topNewsList.length}, Regular=${recentNewsList.length}, Total=${allNewsList.length}`
  );

  return {
    topNews: defaultTopNews,
    topNewsList,
    allNewsList, // 전체 뉴스 리스트 (선택용)
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
