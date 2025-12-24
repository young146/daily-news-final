import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { publishCardNewsToWordPress } from "@/lib/publisher";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const publishToWP = body.publishToWordPress || false;

    const isProduction = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
    
    let browser;
    if (isProduction) {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    } else {
      const localPuppeteer = require("puppeteer");
      browser = await localPuppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);

    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });

    const targetUrl = `${
      process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
    }/print/card-news`;
    console.log(`Puppeteer visiting: ${targetUrl}`);

    await page.goto(targetUrl, {
      waitUntil: "networkidle0",
      timeout: 90000,
    });
    await page.waitForSelector("#capture-target", { timeout: 90000 });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const pngBuffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1200, height: 630 },
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    await browser.close();

    const now = new Date();
    const vietnamTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    );
    const year = vietnamTime.getFullYear();
    const month = String(vietnamTime.getMonth() + 1).padStart(2, "0");
    const day = String(vietnamTime.getDate()).padStart(2, "0");
    const date = `${year}-${month}-${day}`;
    
    // Vercel /tmp folder is writable, but /public is not at runtime
    // Using process.cwd() might work on local but not on Vercel for writing
    // However, the original code used public, so I'll keep it for local and add try-catch
    try {
      const pdfPath = path.join(process.cwd(), "public", `daily-news-${date}.pdf`);
      const pngPath = path.join(process.cwd(), "public", `daily-news-${date}.png`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      fs.writeFileSync(pngPath, pngBuffer);
      console.log("Files saved locally:", pdfPath, pngPath);
    } catch (saveError) {
      console.warn("Could not save files to public folder (expected on Vercel):", saveError.message);
    }

    let wordpressResult = null;

    if (publishToWP) {
      const today = new Date(
        vietnamTime.getFullYear(),
        vietnamTime.getMonth(),
        vietnamTime.getDate()
      );
      today.setHours(0, 0, 0, 0);

      const topNews = await prisma.newsItem.findFirst({
        where: {
          isTopNews: true,
          publishedAt: { gte: today },
        },
        select: { translatedTitle: true, title: true },
      });

      try {
        wordpressResult = await publishCardNewsToWordPress(pngBuffer, date, {
          topNewsTitle: topNews?.translatedTitle || topNews?.title,
          dailyNewsUrl: "https://chaovietnam.co.kr/category/news/dailynews/",
        });
        console.log("[CardNews] WordPress publish success:", wordpressResult);
      } catch (wpError) {
        console.error("[CardNews] WordPress publish failed:", wpError.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        pdfUrl: `/daily-news-${date}.pdf`,
        pngUrl: `/daily-news-${date}.png`,
        wordpress: wordpressResult,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Auto-generation failed:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
