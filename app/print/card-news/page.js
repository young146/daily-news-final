import prisma from "@/lib/prisma";
import CardNewsPreview from "@/app/admin/card-news/CardNewsPreview"; // Import from original location
import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";

// This page renders ONLY the card, with no admin layout.
// It is located at /print/card-news
export default async function CardNewsPrintPage({ searchParams }) {
  // 1. 날짜 파라미터 파싱 (?v=MMDD 형식)
  // Next.js 15에서는 searchParams가 Promise일 수 있으므로 await 처리
  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  let targetDate = null;
  if (params?.v) {
    const vParam = params.v;
    if (vParam && vParam.length === 4) {
      const month = parseInt(vParam.substring(0, 2), 10);
      const day = parseInt(vParam.substring(2, 4), 10);
      const now = new Date();
      const vietnamTime = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
      );
      const year = vietnamTime.getFullYear();
      targetDate = new Date(year, month - 1, day);
      targetDate.setHours(0, 0, 0, 0);
      console.log(`[CardNews Print] Using date from param v=${vParam}: ${targetDate.toISOString()}`);
    }
  }

  // 2. Fetch Data - 날짜 파라미터가 있으면 해당 날짜, 없으면 오늘 날짜 사용
  const now = new Date();
  const vietnamTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  );
  const today = targetDate || new Date(
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
    <div
      id="capture-target"
      style={{
        width: "1200px",
        height: "630px",
        overflow: "hidden",
        margin: 0,
        padding: 0,
      }}
    >
      <style>{`
                #site-header, #site-footer { display: none !important; }
                body { background: white !important; margin: 0 !important; padding: 0 !important; }
            `}</style>
      <CardNewsPreview data={data} mode="print" />
    </div>
  );
}
