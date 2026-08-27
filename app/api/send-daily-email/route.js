import prisma from '@/lib/prisma';
import { sendNewsletterWithFallback } from '../../../lib/email-service.js';
import { filterCardsForToday } from '@/lib/promo-card-filters';
import { getSponsor, emailSubject, isSponsored, PUBLISHER_NAME, PUBLISHER_NAME_EN } from '@/lib/sponsor';
import { renderDailyNewsEmail } from '@/lib/newsletter-template';

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
  // 화면(디자인)은 lib/newsletter-template.js 가 맡는다. 여기서는 **자료를 그 모양에 맞춰
  // 넘기는 일만** 한다 — 디자인을 고칠 때 발송 로직을 건드리지 않게 하려는 분리다.
  //
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

  const items = (newsItems || []).map((item) => ({
    title: item.translatedTitle || item.title || '',
    summary: item.translatedSummary || item.summary || '',
    url: withUtm(item.wordpressUrl || terminalUrl, 'news'),
  }));

  // 🇰🇷 오늘 한국에선 — 제목만 노출(요약을 다 주면 클릭할 이유가 사라진다), 링크는 우리 사이트
  const korea = (koreaNews || []).map((item) => ({
    title: item.translatedTitle || item.title || '',
    url: withUtm(item.wordpressUrl, 'korea'),
  }));

  const promos = (promoCards || []).map((card) => {
    const ytMatch = card.videoUrl?.match(/(?:youtube\.com.*v=|youtu\.be\/)([^&\n?#]+)/);
    const ytId = ytMatch ? ytMatch[1] : null;
    return {
      title: card.title || '',
      description: card.description || '',
      imageUrl: card.imageUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : ''),
      linkUrl: withUtm(card.linkUrl, 'promo'),
    };
  });

  return renderDailyNewsEmail({
    dateString,
    cardImageUrl,
    terminalUrl: withUtm(terminalUrl, 'terminal'),
    newsItems: items,
    koreaNews: korea,
    promoCards: promos,
    brand: {
      publisherName: PUBLISHER_NAME,
      publisherNameEn: PUBLISHER_NAME_EN,
      isSponsored: isSponsored(sponsor),
      sponsor: sponsor || {},
    },
    baseUrl,
  });
}
