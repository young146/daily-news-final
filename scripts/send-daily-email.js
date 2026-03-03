import { PrismaClient } from '@prisma/client';
import { sendNewsletter } from '@/lib/email-service';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

function generateCardNewsHtml(dateString, cardImageUrl, terminalUrl, newsItems) {
  let html = `
    <div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 20px; background-color: #fff;">
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">
        씬짜오베트남 데일리뉴스 | ${dateString}
      </h2>
      <h1 style="font-size: 24px; color: #d1121d; margin-bottom: 20px;">
        씬짜오베트남 오늘의 뉴스
      </h1>
  `;

  if (cardImageUrl) {
    html += `
      <div style="margin-bottom: 30px;">
        <a href="${terminalUrl}" target="_blank" style="text-decoration: none;">
          <img src="${cardImageUrl}" alt="오늘의 뉴스 카드" style="max-width: 100%; height: auto; display: block; border: 1px solid #eee;" />
        </a>
      </div>
    `;
  }

  if (newsItems && newsItems.length > 0) {
    newsItems.forEach(item => {
      // Find the URL (fallback to terminal if missing)
      const url = item.wordpressUrl || terminalUrl;
      const summary = (item.translatedSummary || item.summary || '').replace(/\n/g, '<br/>');

      html += `
        <div style="margin-bottom: 25px; line-height: 1.6;">
          <h3 style="font-size: 16px; font-weight: bold; margin: 0 0 8px 0; color: #222;">
            📍 ${item.translatedTitle || item.title}
          </h3>
          <p style="font-size: 14px; margin: 0 0 8px 0; color: #444;">
            ${summary}
          </p>
          <div style="font-size: 13px;">
            <a href="${url}" style="color: #0056b3; text-decoration: underline; word-break: break-all;" target="_blank">
              자세한 내용은 링크를 클릭: ${url}
            </a>
          </div>
        </div>
      `;
    });
  }

  html += `
      <div style="margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; text-align: left;">
        <div style="font-size: 12px; color: #666; line-height: 1.6;">
          <p style="margin: 0 0 5px 0;"><strong>HANHOA CO., LTD | www.chaovietnam.co.kr</strong></p>
          <p style="margin: 0 0 5px 0;">9Th Floor, EBM Building, 685-685 Dien Bien Phu, Ward 25, Binh Thanh</p>
          <p style="margin: 0;">T. 028)3511 1075 / 3511 1095 | E. info@chaovietnam.co.kr</p>
        </div>
      </div>
    </div>
  `;

  return html;
}

export async function sendDailyDigest(isTest = false) {
  try {
    console.log('Fetching active subscribers...');
    const subscribers = await prisma.subscriber.findMany({
      where: { isActive: true },
      select: { email: true }
    });

    if (subscribers.length === 0 && !isTest) {
      console.log('No active subscribers. Skipping email dispatch.');
      return;
    }

    // Set "today" to begin of the day in Vietnam timezone
    const now = new Date();
    const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const today = new Date(`${vnDateStr}T00:00:00+07:00`);

    // Fetch the generated Card News image URL from the logs (run today)
    console.log("Fetching today's card news image log...");
    const latestLog = await prisma.crawlerLog.findFirst({
      where: {
        status: 'SUCCESS',
        message: { startsWith: '[카드뉴스] 발행 성공' },
        runAt: { gte: today }
      },
      orderBy: { id: 'desc' }
    });

    let cardImageUrl = null;
    let terminalUrl = "https://chaovietnam.co.kr/daily-news-terminal/";

    if (latestLog && latestLog.errorDetails) {
      try {
        const details = JSON.parse(latestLog.errorDetails);
        if (details.imageUrl) cardImageUrl = details.imageUrl;
        if (details.terminalUrl) terminalUrl = details.terminalUrl;
      } catch (e) {
        console.error('Failed to parse crawlerLog for image URL', e);
      }
    }

    if (!cardImageUrl && !isTest) {
      console.log('No card news image generated today. Cannot send card news email.');
      return;
    }

    // Fetch the news items used in today's card news
    console.log('Fetching recent published card news items...');
    const recentNews = await prisma.newsItem.findMany({
      where: {
        status: 'PUBLISHED',
        isCardNews: true,
        publishedAt: {
          gte: today
        }
      },
      orderBy: {
        isTopNews: 'desc', // Top news first
      }
    });

    // Also sort it by recently published if needed
    recentNews.sort((a, b) => b.publishedAt - a.publishedAt);

    // Default Top item at the front
    const topNewsItems = recentNews.filter(n => n.isTopNews);
    const otherNewsItems = recentNews.filter(n => !n.isTopNews);
    const orderedItems = [...topNewsItems, ...otherNewsItems];

    if (orderedItems.length === 0 && !isTest) {
      console.log('No card news items found for today. Skipping email dispatch.');
      return;
    }

    // Generate Date String matching the screenshot: YYYY년 MM월 DD일 (요일)
    const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    const DateObj = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const year = DateObj.getFullYear();
    const month = String(DateObj.getMonth() + 1).padStart(2, "0");
    const day = String(DateObj.getDate()).padStart(2, "0");
    const weekday = weekdays[DateObj.getDay()];
    // format to e.g. "2026년 02월 27일 (금)"
    const todayString = `${year}년 ${month}월 ${day}일 (${weekday[0]})`;

    const htmlContent = generateCardNewsHtml(todayString, cardImageUrl, terminalUrl, orderedItems);
    const subject = `[씬짜오베트남] 데일리뉴스 | ${todayString}`;

    const recipientEmails = isTest
      ? [process.env.TEST_EMAIL || 'test@example.com']
      : subscribers.map(s => s.email);

    console.log(`Sending email to ${recipientEmails.length} recipients...`);
    await sendNewsletter(recipientEmails, subject, htmlContent);
    console.log('Daily digest email sent successfully.');

  } catch (error) {
    console.error('Failed to send daily digest:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running directly from command line for testing/cron
const isMainModule = typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('send-daily-email');
if (isMainModule) {
  const isTest = process.argv.includes('--test');
  sendDailyDigest(isTest);
}
