import prisma from '@/lib/prisma';
import { sendNewsletterWithFallback } from '../../../lib/email-service.js';
import { filterCardsForToday } from '@/lib/promo-card-filters';
import { getSponsor, emailSubject, emailHeaderHtml } from '@/lib/sponsor';

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
        recipientEmails = fallback.split(',').map(e => e.trim()).filter(Boolean);
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

    // 🇰🇷 오늘 한국에선 — 오늘 발행된 한국 뉴스(연합 계열)를 수동 선정과 무관하게 자동 포함.
    // 구독자 99% 가 한국인인데 카드뉴스 선정은 베트남 뉴스 위주라, 한국 뉴스가 이메일에
    // 실릴 자리 자체가 없었다 (2026-08-16 실측: 30일간 이메일 내 한국 뉴스 1건).
    // source 로 거른다 — 번역 단계가 category 를 International 등으로 바꿔버리기 때문.
    let koreaNews = [];
    try {
      const cardNewsIds = new Set(orderedItems.map(n => n.id));
      const koreaCandidates = await prisma.newsItem.findMany({
        where: {
          status: 'PUBLISHED',
          publishedAt: { gte: today },
          source: { in: ['Yonhap Main'] },
        },
        orderBy: [{ keywordScore: 'desc' }, { publishedAt: 'desc' }],
        take: 12,
      });

      // 구글 트렌드(한국 급상승 검색어)와 제목이 겹치는 기사를 앞세운다 — "지금 한국인이
      // 실제로 찾는 주제" 신호. 포털 랭킹은 전부 수집 불가(네이버·네이트 robots 금지,
      // 다음 랭킹 폐지)라 검색어(사실 데이터) × 연합 기사(기존 합법 수집) 조합으로 대체.
      // 트렌드 조회가 실패해도 기본 순서(keywordScore→최신순)로 그대로 나간다.
      let trendTerms = [];
      try {
        const resp = await fetch('https://trends.google.com/trending/rss?geo=KR', {
          signal: AbortSignal.timeout(7000),
        });
        const xml = await resp.text();
        trendTerms = [...xml.matchAll(/<title>([^<]+)<\/title>/g)]
          .map(m => m[1].trim())
          .filter(t => t && t !== 'Daily Search Trends')
          .slice(0, 20);
        console.log(`[SendEmail] 한국 트렌드 검색어 ${trendTerms.length}개: ${trendTerms.slice(0, 5).join(', ')}...`);
      } catch (e) {
        console.warn('[SendEmail] 트렌드 조회 실패 (기본 순서 사용):', e.message);
      }
      // 매칭 규칙: 검색어 전체 일치 또는 3자 이상 토큰 일치 (대소문자 무시).
      // 실측상 트렌드어가 영어("lafc vs san diego")거나 띄어쓰기가 달라 전체 일치만으론 놓친다.
      const trendHit = (n) => {
        const title = (n.translatedTitle || n.title || '').toLowerCase();
        return trendTerms.some(t => {
          const term = t.toLowerCase();
          if (title.includes(term)) return true;
          return term.split(/\s+/).some(tok => tok.length >= 3 && title.includes(tok));
        }) ? 1 : 0;
      };

      koreaNews = koreaCandidates
        .filter(n => !cardNewsIds.has(n.id) && n.wordpressUrl)
        .sort((a, b) => trendHit(b) - trendHit(a)) // 안정 정렬 — 동점이면 DB 순서 유지
        .slice(0, 5);
    } catch (e) {
      console.warn('[SendEmail] 한국 뉴스 블록 조회 실패 (섹션 생략):', e.message);
    }

    // Fetch active promo cards — 요일 + 채널(email) 필터 적용 (lib/promo-card-filters.js)
    const allPromoCards = await prisma.promoCard.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    });
    const promoCards = filterCardsForToday(allPromoCards, new Date(), 'email');

    // Build date string
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const dateObj = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const weekday = weekdays[dateObj.getDay()];
    const todayString = `${year}년 ${month}월 ${day}일 (${weekday})`;

    // 명명권(스폰서) 설정 — 비활성(기본)이면 씬짜오 브랜딩 그대로
    const sponsor = await getSponsor();
    const htmlContent = generateCardNewsHtml(todayString, cardImageUrl, terminalUrl, orderedItems, promoCards, sponsor, koreaNews);
    // 제목에 그날의 톱 기사(편집자가 고른 탑뉴스)를 앞세운다 — 매일 같은 제목은 열 이유가 없다
    const topHeadline = orderedItems[0]?.translatedTitle || orderedItems[0]?.title || '';
    const subject = emailSubject(sponsor, todayString, topHeadline);

    // Preview mode: return HTML only, don't send
    if (body.preview === true) {
      return new Response(htmlContent, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // 전체 발송: e-service 우선, 실패 시 SMTP 개별 폴백
    const { batchTotal, succeeded, failed, method, failedEmails } = await sendNewsletterWithFallback(
      recipientEmails, subject, htmlContent, { forceSmtp, smtpAccount }
    );

    const methodLabel = method === 'smtp' ? '📧 SMTP 개별' : '📨 e-service';

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

function generateCardNewsHtml(dateString, cardImageUrl, terminalUrl, newsItems, promoCards = [], sponsor = null, koreaNews = []) {
  // Vercel 의 NEXT_PUBLIC_BASE_URL 에 프로토콜이 빠져 있으면(예: "daily-news-final.vercel.app")
  // 이메일 안의 href 가 상대경로로 해석돼 수신거부 링크가 죽는다 → https:// 를 보정한다.
  const rawBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr';
  const baseUrl = /^https?:\/\//.test(rawBaseUrl) ? rawBaseUrl : `https://${rawBaseUrl}`;

  // 측정용 UTM (2026-08-16 복구) — /api/click 리다이렉트는 네이버 메일이 스팸으로 분류해
  // 2026-04-17 에 제거했다(커밋 8bd9e0e). 대신 직링크에 UTM 만 붙인다: 리다이렉트가 아니라
  // 네이버에 안전하고, GA4 에서 이메일 유입(source=email/medium=newsletter)이 잡힌다.
  const withUtm = (target, content) => {
    if (!target || !/^https?:\/\//.test(target)) return target || '#';
    const sep = target.includes('?') ? '&' : '?';
    return `${target}${sep}utm_source=email&utm_medium=newsletter&utm_content=${content}`;
  };
  const trackedTerminalUrl = withUtm(terminalUrl, 'terminal');

  let html = `
    <div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 20px; background-color: #fff;">
      ${emailHeaderHtml(sponsor, dateString)}
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
      const trackedNewsUrl = withUtm(url, 'news');
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

  // 🇰🇷 오늘 한국에선 — 제목만 노출(요약을 다 주면 클릭할 이유가 사라진다), 링크는 우리 사이트
  if (koreaNews && koreaNews.length > 0) {
    const koreaItemsHtml = koreaNews.map(item => `
        <li style="margin: 0 0 10px 0; line-height: 1.5;">
          <a href="${withUtm(item.wordpressUrl, 'korea')}" target="_blank" style="font-size: 14px; color: #1e3a8a; text-decoration: none; font-weight: 600;">
            ${item.translatedTitle || item.title} →
          </a>
        </li>`).join('');
    html += `
    <div style="margin: 30px 0; padding: 18px 20px; background: #eff6ff; border-left: 4px solid #1d4ed8; border-radius: 0 8px 8px 0;">
      <p style="font-size: 15px; font-weight: bold; color: #1e3a8a; margin: 0 0 12px 0;">🇰🇷 오늘 한국에선</p>
      <ul style="margin: 0; padding: 0 0 0 4px; list-style: none;">${koreaItemsHtml}
      </ul>
    </div>
  `;
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
      const trackedPromoUrl = withUtm(card.linkUrl, 'promo');
      html += `<div style="margin-bottom: 28px; background: #fff8f0; border: 1px solid #fed7aa; border-radius: 10px; overflow: hidden;">
        ${imgSrc ? `<a href="${trackedPromoUrl}" target="_blank" style="display:block;"><img src="${imgSrc}" alt="${card.title}" style="width:100%;height:auto;display:block;" /></a>` : ''}
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
