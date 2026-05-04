import { PrismaClient } from '@prisma/client';
import { sendNewsletterWithFallback } from '@/lib/email-service';
import { autoLinkHtml } from '@/lib/html-utils';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

function generateCardNewsHtml(dateString, cardImageUrl, terminalUrl, newsItems, promoCards = []) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr';
  const trackUrl = (target, type) => {
    if (!target) return '#';
    return `${baseUrl}/api/click?url=${encodeURIComponent(target)}&type=${type}`;
  };

  const trackedTerminalUrl = trackUrl(terminalUrl, 'TERMINAL');

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
        <a href="${trackedTerminalUrl}" target="_blank" style="text-decoration: none;">
          <img src="${cardImageUrl}" alt="오늘의 뉴스 카드" style="max-width: 100%; height: auto; display: block; border: 1px solid #eee;" />
        </a>
      </div>
    `;
  }

  if (newsItems && newsItems.length > 0) {
    newsItems.forEach(item => {
      const url = item.wordpressUrl || terminalUrl;
      const trackedNewsUrl = trackUrl(url, 'NEWS');
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
            <a href="${trackedNewsUrl}" style="color: #0056b3; text-decoration: underline; word-break: break-all;" target="_blank">
              자세한 내용은 링크를 클릭: ${url}
            </a>
          </div>
        </div>
      `;
    });
  }

  // 홍보카드 섹션 (DB에서 동적 로드)
  if (promoCards && promoCards.length > 0) {
    html += `
      <div style="margin-top: 40px; padding: 24px; background-color: #fff8f0; border: 2px solid #f97316; border-radius: 12px;">
        <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: bold; color: #c2410c; text-align: center;">📣 함께 홍보하기</p>
        <p style="margin: 0 0 20px 0; font-size: 13px; color: #92400e; text-align: center;">제목을 클릭하여 자세히 알아보세요!</p>
    `;

    promoCards.forEach(card => {
      const trackedPromoUrl = trackUrl(card.linkUrl, 'PROMO');
      const imgHtml = card.imageUrl
        ? `<a href="${trackedPromoUrl}" target="_blank"><img src="${card.imageUrl}" alt="${card.title}" style="width:100%;height:auto;border-radius:8px;display:block;margin-bottom:12px;" /></a>`
        : '';
      const processedHtml = card.description ? autoLinkHtml(card.description) : '';
      const descHtml = processedHtml
        ? `<div style="font-size:13px;color:#555;margin:8px 0;line-height:1.5;">${processedHtml}</div>`
        : '';

      html += `
        <div style="margin-bottom:16px;background:#fff;border:1px solid #fed7aa;border-radius:10px;padding:16px;">
          ${imgHtml}
          <h3 style="margin:0 0 4px 0;font-size:15px;font-weight:bold;">
            <a href="${trackedPromoUrl}" target="_blank" style="color:#c2410c;text-decoration:none;">${card.title}</a>
          </h3>
          ${descHtml}
          <a href="${trackedPromoUrl}" target="_blank"
            style="display:inline-block;margin-top:10px;padding:8px 20px;background:#f97316;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;">
            자세히 보기 →
          </a>
        </div>
      `;
    });

    html += `</div>`;
  }

  html += `
      <div style="margin-top: 30px; border-top: 1px solid #ddd; padding-top: 20px; text-align: left;">
        <div style="font-size: 12px; color: #666; line-height: 1.6;">
          <p style="margin: 0 0 5px 0;"><strong>HANHOA CO., LTD | www.chaovietnam.co.kr</strong></p>
          <p style="margin: 0 0 5px 0;">9Th Floor, EBM Building, 685-685 Dien Bien Phu, Ward 25, Binh Thanh</p>
          <p style="margin: 0;">T. 028)3511 1075 / 3511 1095 | E. info@chaovietnam.co.kr</p>
          <div style="margin-top: 20px; text-align: center; border-top: 1px dashed #eee; padding-top: 15px;">
            <p style="margin: 0; color: #888; font-size: 11px;">더 이상 뉴스레터를 받고 싶지 않으시다면 아래 링크를 클릭해 주세요.</p>
            <a href="${baseUrl}/unsubscribe" target="_blank" style="color: #999; text-decoration: underline; font-size: 11px; display: inline-block; margin-top: 5px;">수신 거부 (Unsubscribe)</a>
          </div>
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

    // 활성 홍보카드 DB에서 로드
    console.log('Fetching active promo cards...');
    const promoCards = await prisma.promoCard.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    console.log(`Found ${promoCards.length} active promo cards.`);

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

    const htmlContent = generateCardNewsHtml(todayString, cardImageUrl, terminalUrl, orderedItems, promoCards);
    const subject = `[씬짜오베트남] 데일리뉴스 | ${todayString}`;

    const recipientEmails = isTest
      ? [process.env.TEST_EMAIL || 'test@example.com']
      : subscribers.map(s => s.email);

    console.log(`Sending email to ${recipientEmails.length} recipients...`);
    const sendResult = await sendNewsletterWithFallback(recipientEmails, subject, htmlContent, { forceSmtp: true });
    console.log(`Daily digest email sent. Method: ${sendResult.method} | 성공: ${sendResult.succeeded} | 실패: ${sendResult.failed}`);

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
