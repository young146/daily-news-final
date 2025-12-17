import prisma from "@/lib/prisma";
import CardNewsPreview from "../CardNewsPreview"; // Reuse the component
import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";

// This page is dedicated for Puppeteer to visit and capture.
// It should render ONLY the card, with no admin layout/buttons.
export default async function CardNewsPrintPage() {
  // 1. Fetch Data - 베트남 시간대 기준으로 오늘 날짜 계산
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

  // Top News
  let topNews = await prisma.newsItem.findFirst({
    where: {
      isTopNews: true,
      publishedAt: { gte: today },
    },
    orderBy: { publishedAt: "desc" },
  });

  if (!topNews) {
    topNews = await prisma.newsItem.findFirst({
      where: {
        isPublishedDaily: true,
        publishedAt: { gte: today },
      },
      orderBy: { publishedAt: "desc" },
    });
  }

  // Card News Items (Grid)
  const cardNewsItems = await prisma.newsItem.findMany({
    where: {
      isCardNews: true,
      publishedAt: { gte: today },
      id: { not: topNews?.id },
    },
    orderBy: { publishedAt: "desc" },
    take: 4,
  });

  // External Data
  const weather = await getSeoulWeather();
  const rates = await getExchangeRates();

  const data = { topNews, cardNewsItems, weather, rates };

  return (
    <div style={{ width: "1200px", height: "630px", overflow: "hidden" }}>
      {/* Reuse the component but maybe need to tweak it to remove buttons if they are inside */}
      {/* Actually, CardNewsPreview has buttons inside. We should probably extract the UI part or just hide buttons via CSS */}
      <CardNewsPreview data={data} mode="print" />
    </div>
  );
}
