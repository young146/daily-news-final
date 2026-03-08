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

    // Fetch active promo cards
    const promoCards = await prisma.promoCard.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });

    // Build date string
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const dateObj = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const weekday = weekdays[dateObj.getDay()];
    const todayString = `${year}년 ${month}월 ${day}일 (${weekday})`;

    const htmlContent = generateCardNewsHtml(todayString, cardImageUrl, terminalUrl, orderedItems, promoCards);
    const subject = `[씬짜오베트남] 데일리뉴스 | ${todayString}`;

    // Preview mode: return HTML only, don't send
    if (body.preview === true) {
      return new Response(htmlContent, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

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

function generateCardNewsHtml(dateString, cardImageUrl, terminalUrl, newsItems, promoCards = []) {
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

  // Promo Cards Section
  if (promoCards && promoCards.length > 0) {
    html += `<div style="margin-top: 40px; border-top: 3px solid #f97316; padding-top: 24px;">
      <p style="font-size: 13px; font-weight: bold; color: #f97316; letter-spacing: 1px; margin: 0 0 20px 0;">📣 함께 홍보해요</p>`;
    promoCards.forEach(card => {
      const ytMatch = card.videoUrl?.match(/(?:youtube\.com.*v=|youtu\.be\/)([^&\n?#]+)/);
      const ytId = ytMatch ? ytMatch[1] : null;
      const imgSrc = card.imageUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null);
      html += `<div style="margin-bottom: 28px; background: #fff8f0; border: 1px solid #fed7aa; border-radius: 10px; overflow: hidden;">
        ${imgSrc ? `<a href="${card.linkUrl || '#'}" target="_blank" style="display:block;"><img src="${imgSrc}" alt="${card.title}" style="width:100%;max-height:280px;object-fit:cover;display:block;" /></a>` : ''}
        <div style="padding: 16px 20px;">
          <h3 style="font-size: 16px; font-weight: bold; color: #1f2937; margin: 0 0 8px 0;">${card.title}</h3>
          ${card.description ? `<p style="font-size: 13px; color: #4b5563; line-height: 1.7; white-space: pre-wrap; margin: 0 0 14px 0;">${card.description}</p>` : ''}
          ${card.linkUrl ? `<a href="${card.linkUrl}" target="_blank" style="display:inline-block;background:#f97316;color:#fff;font-size:13px;font-weight:bold;padding:10px 22px;border-radius:6px;text-decoration:none;">참여하기 →</a>` : ''}
        </div>
      </div>`;
    });
    html += `</div>`;
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
