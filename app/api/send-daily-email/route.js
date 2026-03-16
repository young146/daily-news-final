import prisma from '@/lib/prisma';
import { sendNewsletter, sendNewsletterWithFallback } from '../../../lib/email-service.js';

export const runtime = 'nodejs';
export const maxDuration = 300; // Vercel Pro: 최대 5분 (대량 발송용)

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const isTest = body.test === true;
    const customEmail = body.customEmail ? body.customEmail.trim() : null;
    const forceSmtp = body.forceSmtp === true;
    const smtpAccount = body.smtpAccount || 'both'; // 'both' | 'account1' | 'account2'


    // 수신자 결정
    let recipientEmails;
    if (customEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customEmail)) {
        return Response.json({ success: false, error: '유효하지 않은 이메일 주소입니다.' });
      }
      recipientEmails = [customEmail];
    } else if (isTest) {
      // 테스트 이메일 목록에서 가져옴
      const testEmails = await prisma.testEmail.findMany({ orderBy: { createdAt: 'asc' } });
      recipientEmails = testEmails.map(t => t.email);
      if (recipientEmails.length === 0) {
        // fallback: TEST_EMAIL 환경변수
        const fallback = process.env.TEST_EMAIL;
        if (!fallback) {
          return Response.json({ success: false, error: '테스트 이메일 목록이 비어있습니다. 수신자를 먼저 추가해주세요.' });
        }
        recipientEmails = [fallback];
      }
    } else {
      // 전체 구독자
      const subscribers = await prisma.subscriber.findMany({
        where: { isActive: true },
        select: { email: true }
      });
      recipientEmails = subscribers
        .map(s => s.email ? s.email.trim() : '')
        .filter(email => email.length > 0);
      if (recipientEmails.length === 0) {
        return Response.json({ success: false, error: '활성 구독자가 없습니다.' });
      }
    }

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

    // 전체 발송: Resend 우선, 실패 시 SMTP 개별 폴백
    const { batchTotal, succeeded, failed, method, failedEmails } = await sendNewsletterWithFallback(
      recipientEmails, subject, htmlContent, { forceSmtp, smtpAccount }
    );

    const methodLabel = method === 'smtp' ? '📧 SMTP 개별' : '🚀 Resend';

    return Response.json({
      success: true,
      message: `[${methodLabel}] 총 ${batchTotal}건 발송 처리 | 성공 ${succeeded}명 / 실패 ${failed}명`,
      succeeded,
      failed,
      method,
      failedEmails,
    });
  } catch (error) {
    console.error('[SendEmail API] Error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

function generateCardNewsHtml(dateString, cardImageUrl, terminalUrl, newsItems, promoCards = []) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr';
  const trackUrl = (target, type) => {
    if (!target) return '#';
    return `${baseUrl}/api/click?url=${encodeURIComponent(target)}&type=${type}`;
  };

  const trackedTerminalUrl = trackUrl(terminalUrl, 'TERMINAL');

  let html = `
    <div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 20px; background-color: #fff;">
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">씬짜오베트남 데일리뉴스 | ${dateString}</h2>
      <h1 style="font-size: 24px; color: #d1121d; margin-bottom: 20px;">씬짜오베트남 오늘의 뉴스</h1>
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
          <h3 style="font-size: 16px; font-weight: bold; margin: 0 0 8px 0; color: #222;">📍 ${item.translatedTitle || item.title}</h3>
          <p style="font-size: 14px; margin: 0 0 8px 0; color: #444;">${summary}</p>
          <div style="font-size: 13px;">
            <a href="${trackedNewsUrl}" style="color: #0056b3; text-decoration: underline; word-break: break-all;" target="_blank">
              자세한 내용은 링크를 클릭: ${url}
            </a>
          </div>
        </div>
      `;
    });
  }

  // 섹션 안내 문구
  html += `
    <div style="margin: 30px 0; padding: 16px 20px; background: #f8f9fa; border-left: 4px solid #d1121d; border-radius: 0 6px 6px 0;">
      <p style="font-size: 15px; font-weight: bold; color: #1a1a1a; margin: 0 0 6px 0; line-height: 1.6;">
        베트남의 흐름을 관망할 수 있는 뉴스가 섹션별로 다양하게 게재되어 있습니다.
      </p>
      <a href="${trackedTerminalUrl}" target="_blank" style="font-size: 13px; color: #d1121d; text-decoration: underline;">
        👉 뉴스 터미널에서 전체 뉴스 확인하기
      </a>
    </div>
  `;

  // Promo Cards Section
  if (promoCards && promoCards.length > 0) {
    html += `<div style="margin-top: 40px; border-top: 3px solid #f97316; padding-top: 24px;">
      <p style="font-size: 13px; font-weight: bold; color: #f97316; letter-spacing: 1px; margin: 0 0 20px 0;">📣 함께 홍보해요</p>`;
    promoCards.forEach(card => {
      const ytMatch = card.videoUrl?.match(/(?:youtube\.com.*v=|youtu\.be\/)([^&\n?#]+)/);
      const ytId = ytMatch ? ytMatch[1] : null;
      const imgSrc = card.imageUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null);
      const trackedPromoUrl = trackUrl(card.linkUrl, 'PROMO');
      html += `<div style="margin-bottom: 28px; background: #fff8f0; border: 1px solid #fed7aa; border-radius: 10px; overflow: hidden;">
        ${imgSrc ? `<a href="${trackedPromoUrl}" target="_blank" style="display:block;"><img src="${imgSrc}" alt="${card.title}" style="width:100%;max-height:280px;object-fit:cover;display:block;" /></a>` : ''}
        <div style="padding: 16px 20px;">
          <h3 style="font-size: 16px; font-weight: bold; color: #1f2937; margin: 0 0 8px 0;">${card.title}</h3>
          ${card.description ? `<p style="font-size: 13px; color: #4b5563; line-height: 1.7; white-space: pre-wrap; margin: 0 0 14px 0;">${card.description}</p>` : ''}
          ${card.linkUrl ? `<a href="${trackedPromoUrl}" target="_blank" style="display:inline-block;background:#f97316;color:#fff;font-size:13px;font-weight:bold;padding:10px 22px;border-radius:6px;text-decoration:none;">참여하기 →</a>` : ''}
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
