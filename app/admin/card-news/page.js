import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";
import CardNewsSimple from "./CardNewsSimple";
import prisma from "@/lib/prisma"; // ✅ 싱글톤 Prisma 클라이언트 사용

export const dynamic = "force-dynamic"; // ✅ Vercel에서 캐싱 방지, 항상 최신 데이터 가져오기

async function getData() {
  try {
    // 1. 베트남 시간대(UTC+7) 기준으로 '오늘'의 시작 시간 계산 (통일된 로직)
    const now = new Date();
    const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // "YYYY-MM-DD"
    const today = new Date(`${vnDateStr}T00:00:00+07:00`);

    // 2. 오늘 발행된 뉴스 중 isCardNews = true인 탑뉴스 가져오기 (전체)
    let topNewsList = await prisma.newsItem.findMany({
      where: {
        isTopNews: true,
        status: "PUBLISHED",
        isCardNews: true,
        publishedAt: { gte: today },
      },
      orderBy: {
        publishedAt: "desc",
      },
      // 제한을 없애 지정한 모든 탑뉴스가 보이도록 수정
    });

    // 3. 오늘 발행된 뉴스 중 isCardNews = true인 일반 뉴스 가져오기 (전체)
    const topNewsIds = topNewsList.map((n) => n.id);
    let recentNewsList = await prisma.newsItem.findMany({
      where: {
        id: { notIn: topNewsIds },
        isTopNews: false,
        status: "PUBLISHED",
        isCardNews: true,
        publishedAt: { gte: today },
      },
      orderBy: {
        publishedAt: "desc",
      },
      // 제한을 없애 지정한 모든 일반 뉴스가 보이도록 수정
    });

    // 4. ⭐ [지능형 폴백] 선택된 뉴스가 하나도 없다면 오늘 발행된 전체 뉴스 중 최신순으로 채워줌
    let isUsingFallback = false;
    let fallbackReason = null;

    if (topNewsList.length === 0 && recentNewsList.length === 0) {
      console.log("[CardNews] 선택된 뉴스가 없어 오늘 발행된 전체 뉴스를 불러옵니다.");
      isUsingFallback = true;
      fallbackReason = "선택된 카드뉴스가 없어 오늘 발행된 뉴스를 자동으로 가져왔습니다.";

      topNewsList = await prisma.newsItem.findMany({
        where: {
          isTopNews: true,
          status: "PUBLISHED",
          publishedAt: { gte: today },
        },
        orderBy: { publishedAt: "desc" },
        take: 2,
      });

      const fallbackTopIds = topNewsList.map(n => n.id);
      recentNewsList = await prisma.newsItem.findMany({
        where: {
          id: { notIn: fallbackTopIds },
          isTopNews: false,
          status: "PUBLISHED",
          publishedAt: { gte: today },
        },
        orderBy: { publishedAt: "desc" },
        take: 8, // 폴백 시에는 적당히 8개 정도 보여줌
      });
    }

    // 5. 전체 뉴스 리스트
    const allNewsList = [...topNewsList, ...recentNewsList];

    // 6. 기본 선택 뉴스 결정
    const defaultTopNews = allNewsList.length > 0 ? allNewsList[0] : null;

    // 7. 외부 API 병렬 호출 (날씨, 환율)
    const [weather, rates] = await Promise.all([
      getSeoulWeather(),
      getExchangeRates(),
    ]);

    console.log(
      `[CardNews Page] 뉴스 목록 구성 완료: Top=${topNewsList.length}, Regular=${recentNewsList.length}, Total=${allNewsList.length}, Fallback=${isUsingFallback}`
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
  } catch (error) {
    console.error("[CardNews Page] 데이터 가져오기 실패:", error);

    // ✅ 에러 발생 시 기본값 반환 (페이지 크래시 방지)
    return {
      topNews: null,
      topNewsList: [],
      allNewsList: [],
      isUsingFallback: false,
      fallbackReason: "데이터를 불러오는 중 오류가 발생했습니다.",
      weather: null,
      rates: null,
    };
  }
}

export default async function CardNewsPreviewPage() {
  const data = await getData();
  return <CardNewsSimple data={data} />;
}
