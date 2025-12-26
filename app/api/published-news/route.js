import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function GET() {
  try {
    // 베트남 시간대(UTC+7) 기준으로 '오늘'의 시작과 끝을 정확하게 계산
    const now = new Date();
    const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // "YYYY-MM-DD"
    const today = new Date(`${vnDateStr}T00:00:00+07:00`);
    const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const publishedNews = await prisma.newsItem.findMany({
      where: {
        status: "PUBLISHED",
        publishedAt: {
          gte: today,
          lt: endOfToday,
        },
      },
      orderBy: [
        { isTopNews: "desc" }, // 탑뉴스를 무조건 리스트 최상단에 배치
        { publishedAt: "desc" },
      ],
      select: {
        id: true,
        title: true,
        translatedTitle: true,
        source: true,
        category: true,
        isTopNews: true,
        wordpressUrl: true,
        publishedAt: true,
      },
      // 50개 제한을 없애고 오늘 발행된 모든 뉴스를 보여줌 (유령 뉴스 방지)
    });

    const earliest = publishedNews[publishedNews.length - 1]?.publishedAt || null;
    const latest = publishedNews[0]?.publishedAt || null;

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/f6fc14ce-ac4a-46f5-b5a7-c8a9162c4f22',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'run2',hypothesisId:'H4',location:'app/api/published-news/route.js:GET',message:'Published news fetch',data:{count:publishedNews.length,start:today.toISOString(),end:endOfToday.toISOString(),latest,earliest},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return NextResponse.json({ news: publishedNews });
  } catch (error) {
    console.error("Error fetching published news:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.newsItem.delete({
      where: { id },
    });

    revalidatePath("/admin");
    revalidatePath("/admin/settings");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting news:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
