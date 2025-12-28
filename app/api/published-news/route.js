import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function GET() {
  try {
    // ✅ 단순화: 최신 1회 발행분만 가져옵니다
    // "발행분" = 같은 날짜에 발행된 뉴스 묶음
    // 탑뉴스는 해당 발행분 안에서만 의미가 있습니다
    
    const now = new Date();
    const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    
    // 가장 최근 발행일 찾기
    const latestPublished = await prisma.newsItem.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true }
    });

    // 발행된 뉴스가 없으면 빈 배열 반환
    if (!latestPublished || !latestPublished.publishedAt) {
      return NextResponse.json({ news: [] });
    }

    // 최신 발행일 계산 (베트남 시간 기준)
    const latestDateStr = latestPublished.publishedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const dayStart = new Date(`${latestDateStr}T00:00:00+07:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // 최신 1회 발행분만 가져오기
    const publishedNews = await prisma.newsItem.findMany({
      where: {
        status: "PUBLISHED",
        publishedAt: {
          gte: dayStart,
          lt: dayEnd
        }
      },
      orderBy: [
        { isTopNews: "desc" }, // 탑뉴스 먼저
        { category: "asc" },   // 카테고리순
        { publishedAt: "desc" } // 최신순
      ],
      select: {
        id: true,
        title: true,
        translatedTitle: true,
        source: true,
        category: true,
        isTopNews: true,
        isCardNews: true,
        wordpressUrl: true,
        publishedAt: true,
        updatedAt: true
      },
    });

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
