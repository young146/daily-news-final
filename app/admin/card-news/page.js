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

  // 탑뉴스 리스트 가져오기 (오늘 날짜 기준, 최대 2개)
  const topNewsList = await prisma.newsItem.findMany({
    where: {
      isTopNews: true,
      publishedAt: { gte: today },
    },
    orderBy: { publishedAt: "desc" },
    take: 2,
  });

  // 첫 번째 탑뉴스 (기본값)
  // 탑뉴스가 없으면 오늘 날짜의 가장 먼저 올라온 뉴스 사용
  const topNews =
    topNewsList.length > 0
      ? topNewsList[0]
      : await prisma.newsItem.findFirst({
          where: {
            publishedAt: { gte: today },
          },
          orderBy: { publishedAt: "desc" },
        });

  const weather = await getSeoulWeather();
  const rates = await getExchangeRates();

  return { topNews, topNewsList, weather, rates };
}

export default async function CardNewsPreviewPage() {
  const data = await getData();
  return <CardNewsSimple data={data} />;
}
