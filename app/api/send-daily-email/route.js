import prisma from '@/lib/prisma';
import { sendNewsletter } from '../../../lib/email-service.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const isTest = body.test === true;

    // Fetch active subscribers
    const subscribers = await prisma.subscriber.findMany({
      where: { isActive: true },
      select: { email: true }
    });

    if (subscribers.length === 0 && !isTest) {
      return Response.json({ success: false, error: '활성 구독자가 없습니다.' });
    }

    // Clean up spaces on fetched emails just in case
    const validEmails = subscribers
      .map(s => s.email ? s.email.trim() : '')
      .filter(email => email.length > 0);

    // Set "today" to start of day in Vietnam timezone
    const now = new Date();
    const vnDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const today = new Date(`${vnDateStr}T00:00:00+07:00`);

    // Fetch the generated Card News image URL from logs (today)
    const latestLog = await prisma.crawlerLog.findFirst({
      where: {
        status: 'SUCCESS',
        message: { startsWith: '[카드뉴스] 발행 성공' },
        runAt: { gte: today }
      },
      orderBy: { id: 'desc' }
    });

    let cardImageUrl = null;
    let terminalUrl = 'https://chaovietnam.co.kr/daily-news-terminal/';

    if (latestLog?.errorDetails) {
      try {
        const details = JSON.parse(latestLog.errorDetails);
        if (details.imageUrl) cardImageUrl = details.imageUrl;
        if (details.terminalUrl) terminalUrl = details.terminalUrl;
      } catch (e) {
        console.error('Failed to parse crawlerLog:', e);
      }
    }

    if (!cardImageUrl && !isTest) {
      return Response.json({ success: false, error: '오늘 발행된 전령카드 이미지가 없습니다. 먼저 전령카드를 발행해주세요.' });
    }

    // Fetch today's card news items
    const recentNews = await prisma.newsItem.findMany({
      where: {
        status: 'PUBLISHED',
        isCardNews: true,
        publishedAt: { gte: today }
      },
      orderBy: { isTopNews: 'desc' }
    });

    const topNewsItems = recentNews.filter(n => n.isTopNews);
    const otherNewsItems = recentNews.filter(n => !n.isTopNews);
    const orderedItems = [...topNewsItems, ...otherNewsItems];

    // Build date string
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const dateObj = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const weekday = weekdays[dateObj.getDay()];
    const todayString = `${year}년 ${month}월 ${day}일 (${weekday})`;

    const htmlContent = generateCardNewsHtml(todayString, cardImageUrl, terminalUrl, orderedItems);
    const subject = `[씬짜오베트남] 데일리뉴스 | ${todayString}`;

    const recipientEmails = isTest
      ? [process.env.TEST_EMAIL || 'test@example.com']
      : validEmails;

    await sendNewsletter(recipientEmails, subject, htmlContent);

    return Response.json({ success: true, message: `${recipientEmails.length}명에게 발송 완료` });
  } catch (error) {
    console.error('[SendEmail API] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

function generateCardNewsHtml(dateString, cardImageUrl, terminalUrl, newsItems) {
  let html = `
    <div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 20px; background-color: #fff;">
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">씬짜오베트남 데일리뉴스 | ${dateString}</h2>
      <h1 style="font-size: 24px; color: #d1121d; margin-bottom: 20px;">씬짜오베트남 오늘의 뉴스</h1>
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
      const url = item.wordpressUrl || terminalUrl;
      const summary = (item.translatedSummary || item.summary || '').replace(/\n/g, '<br/>');
      html += `
        <div style="margin-bottom: 25px; line-height: 1.6;">
          <h3 style="font-size: 16px; font-weight: bold; margin: 0 0 8px 0; color: #222;">📍 ${item.translatedTitle || item.title}</h3>
          <p style="font-size: 14px; margin: 0 0 8px 0; color: #444;">${summary}</p>
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
      <div style="margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px;">
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
