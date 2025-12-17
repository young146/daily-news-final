import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    let dbConnected = false;
    let totalNews = 0;
    let publishedToday = 0;

    try {
      totalNews = await prisma.newsItem.count();
      dbConnected = true;

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

      publishedToday = await prisma.newsItem.count({
        where: {
          status: "PUBLISHED",
          updatedAt: {
            gte: today,
          },
        },
      });
    } catch (err) {
      console.error("DB error:", err.message);
    }

    const wpConfigured = !!process.env.WORDPRESS_APP_PASSWORD;
    const openaiConfigured = !!process.env.OPENAI_API_KEY;

    return NextResponse.json({
      database: {
        connected: dbConnected,
        totalNews,
        publishedToday,
      },
      wordpress: {
        configured: wpConfigured,
        url: process.env.WORDPRESS_URL || "https://chaovietnam.co.kr",
      },
      openai: {
        configured: openaiConfigured,
      },
      server: {
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
  } catch (error) {
    console.error("System info error:", error);
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 }
    );
  }
}
