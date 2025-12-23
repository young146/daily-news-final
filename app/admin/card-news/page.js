import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";
import CardNewsSimple from "./CardNewsSimple";
import prisma from "@/lib/prisma"; // ✅ 싱글톤 Prisma 클라이언트 사용

export const dynamic = "force-dynamic"; // ✅ Vercel에서 캐싱 방지, 항상 최신 데이터 가져오기

async function getData() {
  try {
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
        id: { notIn: topNewsIds }, // ✅ Prisma는 빈 배열도 처리 가능
        isTopNews: false,
        status: "PUBLISHED",
        isCardNews: true, // ✅ 카드 뉴스로 표시된 것만
      },
      orderBy: {
        publishedAt: "desc",
      },
      take: 3,
    });

    // 3. 전체 뉴스 리스트 (탑뉴스 + 일반 뉴스, 이미 2+3=5개로 제한됨)
    const allNewsList = [...topNewsList, ...recentNewsList];

    // 4. 기본 선택 뉴스
    const defaultTopNews =
      topNewsList.length > 0
        ? topNewsList[0]
        : recentNewsList.length > 0
        ? recentNewsList[0]
        : null;

    // 5. fallback 여부 확인
    const isUsingFallback =
      topNewsList.length === 0 && recentNewsList.length > 0;
    const fallbackReason = isUsingFallback
      ? "탑뉴스가 지정되지 않아 최신 뉴스를 사용합니다."
      : null;

    // 6. 외부 API 병렬 호출 ✅ (성능 개선: 약 1초 단축)
    const [weather, rates] = await Promise.all([
      getSeoulWeather(),
      getExchangeRates(),
    ]);

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
