import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function GET() {
  try {
    // 베트남 시간대 기준으로 오늘 날짜 시작 시간 계산
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

    const publishedNews = await prisma.newsItem.findMany({
      where: {
        status: "PUBLISHED",
        updatedAt: {
          gte: today,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        title: true,
        translatedTitle: true,
        source: true,
        category: true,
        wordpressUrl: true,
        updatedAt: true,
      },
      take: 50,
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
