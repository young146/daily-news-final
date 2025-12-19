import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { translateText, translateNewsItem } from "@/lib/translator";
import GenerateButton from "./generate-button";
import CrawlNewsButton from "./crawl-news-button";
import CollectedNewsList from "./collected-news-list";
import SelectedNewsList from "./selected-news-list";
import ManualNewsButton from "./manual-news-button";

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

async function getNews() {
  const allNews = await prisma.newsItem.findMany({
    orderBy: { createdAt: "desc" },
    where: {
      status: {
        notIn: ["PUBLISHED", "ARCHIVED"],
      },
    },
  });

  const selectionPark = allNews.filter((item) => !item.isSelected);
  const topNews = allNews.filter((item) => item.isSelected);

  // Get today's published count - 베트남 시간대 기준
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
  const todayPublishedCount = await prisma.newsItem.count({
    where: {
      status: "PUBLISHED",
      publishedAt: { gte: today },
    },
  });

  return { selectionPark, topNews, todayPublishedCount };
}

async function addToTop(formData) {
  "use server";
  const id = formData.get("id");
  await prisma.newsItem.update({
    where: { id },
    data: { isSelected: true },
  });
  revalidatePath("/admin");
}

async function removeFromTop(formData) {
  "use server";
  const id = formData.get("id");
  await prisma.newsItem.update({
    where: { id },
    data: { isSelected: false, isTopNews: false },
  });
  revalidatePath("/admin");
}

async function toggleTopNews(formData) {
  "use server";
  try {
    const id = formData.get("id");

    const item = await prisma.newsItem.findUnique({ where: { id } });
    if (!item) {
      return { success: false, error: "뉴스를 찾을 수 없습니다." };
    }

    if (item.isTopNews) {
      // 탑뉴스 해제
      await prisma.newsItem.update({
        where: { id },
        data: { isTopNews: false },
      });
      revalidatePath("/admin");
      return { success: true, message: "탑뉴스가 해제되었습니다." };
    } else {
      // 탑뉴스 설정 시도
      const count = await prisma.newsItem.count({
        where: {
          isTopNews: true,
          status: { notIn: ["PUBLISHED", "ARCHIVED"] },
        },
      });

      if (count >= 2) {
        // 현재 탑뉴스 목록 조회
        const currentTopNews = await prisma.newsItem.findMany({
          where: {
            isTopNews: true,
            status: { notIn: ["PUBLISHED", "ARCHIVED"] },
          },
          select: { translatedTitle: true, title: true, id: true },
          take: 2,
        });

        const topNewsTitles = currentTopNews
          .map((n) => n.translatedTitle || n.title)
          .join(", ");
        return {
          success: false,
          error: `탑뉴스는 최대 2개까지만 지정할 수 있습니다.\n\n현재 지정된 탑뉴스:\n${topNewsTitles}\n\n기존 탑뉴스를 해제한 후 다시 시도해주세요.`,
        };
      }

      await prisma.newsItem.update({
        where: { id },
        data: { isTopNews: true },
      });
      revalidatePath("/admin");
      return { success: true, message: "탑뉴스로 지정되었습니다." };
    }
  } catch (error) {
    console.error("Toggle top news failed:", error);
    return { success: false, error: `탑뉴스 지정 실패: ${error.message}` };
  }
}

async function deleteNewsItem(formData) {
  "use server";
  const id = formData.get("id");
  await prisma.newsItem.delete({ where: { id } });
  revalidatePath("/admin");
}

export default async function AdminPage() {
  const { selectionPark, topNews, todayPublishedCount } = await getNews();

  // 선정된 뉴스(topNews, isSelected=true)만 기준으로 카운트
  // 뉴스가 "Select →" 버튼으로 selected 박스로 이동하는 순간부터 현황에 반영
  const topCount = topNews.filter((n) => n.isTopNews).length;
  const socCount = topNews.filter(
    (n) => (n.category === "Society" || n.category === "사회") && !n.isTopNews
  ).length;
  const ecoCount = topNews.filter(
    (n) => (n.category === "Economy" || n.category === "경제") && !n.isTopNews
  ).length;
  const culCount = topNews.filter(
    (n) => (n.category === "Culture" || n.category === "문화") && !n.isTopNews
  ).length;
  const polCount = topNews.filter(
    (n) => (n.category === "Politics" || n.category === "Policy" || n.category === "정치" || n.category === "정책") && !n.isTopNews
  ).length;
  const intCount = topNews.filter(
    (n) => (n.category === "International" || n.category === "국제") && !n.isTopNews
  ).length;
  const kvCount = topNews.filter(
    (n) => (n.category === "Korea-Vietnam" || n.category === "한-베" || n.category === "한베") && !n.isTopNews
  ).length;
  const comCount = topNews.filter(
    (n) => (n.category === "Community" || n.category === "교민" || n.category === "교민소식") && !n.isTopNews
  ).length;
  const cardNewsCount = topNews.filter((n) => n.isCardNews).length;

  const Counter = ({ label, count, target, href }) => {
    const content = (
      <div
        className={`px-2 py-1.5 rounded-md border flex flex-col items-center justify-center min-w-[100px] ${
          count < target
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-green-50 border-green-200 text-green-700"
        }`}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-0.5">
          {label}
        </div>
        <div className="text-lg font-bold leading-none">
          {count}{" "}
          <span className="text-xs font-normal text-gray-400">/ {target}</span>
        </div>
      </div>
    );

    return href ? <Link href={href}>{content}</Link> : content;
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2">
          <ManualNewsButton />
          <CrawlNewsButton />
          <Link
            href="/admin/card-news"
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition flex items-center gap-2"
          >
            📮 전령카드 확인하기
          </Link>
          <Link
            href="/admin/stats"
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition flex items-center gap-2"
          >
            📊 통계
          </Link>
          <Link
            href="/admin/settings"
            className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 transition flex items-center gap-2"
          >
            ⚙️ 설정
          </Link>
        </div>
      </div>

      {/* Status Dashboard (Sticky) */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm py-3 mb-6 -mx-6 px-6 border-b border-gray-200">
        <div className="flex justify-between gap-2 overflow-x-auto">
          <Counter label="탑뉴스" count={topCount} target={2} />
          <Counter label="Society" count={socCount} target={4} />
          <Counter label="Economy" count={ecoCount} target={4} />
          <Counter label="Culture" count={culCount} target={4} />
          <Counter label="Politics" count={polCount} target={4} />
          <Counter label="International" count={intCount} target={4} />
          <Counter label="Korea-Vietnam" count={kvCount} target={4} />
          <Counter label="Community" count={comCount} target={4} />
          <Counter
            label="Card News"
            count={cardNewsCount}
            target={4}
            href="/admin/card-news"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left Column: Selection Park */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-700">Collected News</h2>
          </div>
          <CollectedNewsList
            items={selectionPark}
            addToTopAction={addToTop}
            deleteNewsItemAction={deleteNewsItem}
          />
        </div>

        {/* Right Column: 선정된 뉴스 */}
        <SelectedNewsList
          initialTopNews={topNews}
          removeFromTopAction={removeFromTop}
          toggleTopNewsAction={toggleTopNews}
          todayPublishedCount={todayPublishedCount}
        />
      </div>
    </div>
  );
}
