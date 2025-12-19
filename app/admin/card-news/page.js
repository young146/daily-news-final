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

  // 탑뉴스 리스트 가져오기 (더 넓은 조건: isTopNews=true인 모든 항목)
  // - publishedAt 조건 없이 isTopNews=true인 모든 항목 조회
  // - 최근에 지정된 탑뉴스도 포함되도록 함
  const topNewsList = await prisma.newsItem.findMany({
    where: {
      isTopNews: true,
      status: { notIn: ['PUBLISHED', 'ARCHIVED'] }, // 발행/아카이브된 것은 제외
    },
    orderBy: [
      { updatedAt: "desc" }, // 최근에 지정된 것 우선
      { publishedAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 2,
  });

  // 첫 번째 탑뉴스 (기본값)
  // 탑뉴스가 없으면 오늘 날짜의 가장 먼저 올라온 뉴스 사용 (하이브리드 방식)
  const topNews =
    topNewsList.length > 0
      ? topNewsList[0]
      : await prisma.newsItem.findFirst({
          where: {
            status: { notIn: ['PUBLISHED', 'ARCHIVED'] },
            OR: [
              { publishedAt: { gte: today } },
              {
                AND: [{ isPublishedMain: true }, { publishedAt: null }],
              },
              { publishedAt: null }, // publishedAt이 null인 경우도 포함
            ],
          },
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
        });

  const weather = await getSeoulWeather();
  const rates = await getExchangeRates();

  return { topNews, topNewsList, weather, rates };
}

export default async function CardNewsPreviewPage() {
  const data = await getData();
  return <CardNewsSimple data={data} />;
}
