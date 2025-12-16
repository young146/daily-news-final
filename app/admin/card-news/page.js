import { PrismaClient } from "@prisma/client";
import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";
import CardNewsSimple from "./CardNewsSimple";

const prisma = new PrismaClient();

async function getData() {
  // 탑뉴스 리스트 가져오기 (최대 2개)
  const topNewsList = await prisma.newsItem.findMany({
    where: { isTopNews: true },
    orderBy: { publishedAt: "desc" },
    take: 2,
  });

  // 첫 번째 탑뉴스 (기본값)
  const topNews =
    topNewsList.length > 0
      ? topNewsList[0]
      : await prisma.newsItem.findFirst({ orderBy: { createdAt: "desc" } });

  const weather = await getSeoulWeather();
  const rates = await getExchangeRates();

  return { topNews, topNewsList, weather, rates };
}

export default async function CardNewsPreviewPage() {
  const data = await getData();
  return <CardNewsSimple data={data} />;
}
