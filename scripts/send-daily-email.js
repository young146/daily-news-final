import { PrismaClient } from '@prisma/client';
import { sendNewsletterWithFallback } from '@/lib/email-service';
import { autoLinkHtml } from '@/lib/html-utils';
import { buildKakaoBroadcastText } from '@/lib/kakao-broadcast';
import { getFirestore } from '@/lib/firebase-admin';
import { filterCardsForToday, getVietnamIsoWeekday } from '@/lib/promo-card-filters';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();

// 최근 24시간 신규 채용/부동산/중고 가져오기 (메인 깔때기 단계 1 보강)
// 3채널 동기화: 환영화면 + 비회원 뉴스탭 카드 + 이메일 모두 같은 데이터 소스
// 실패해도 이메일 전체 흐름을 막지 않는다 (try/catch + fallback)
async function fetchRecentJobsAndRealEstate() {
  try {
    const db = getFirestore();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [jobsSnap, realEstateSnap, itemsSnap] = await Promise.all([
      db.collection('Jobs').where('createdAt', '>', since).limit(5).get().catch(() => null),
      db.collection('RealEstate').where('createdAt', '>', since).limit(5).get().catch(() => null),
      db.collection('XinChaoDanggn').where('createdAt', '>', since).limit(5).get().catch(() => null),
    ]);

    return {
      newJobs: jobsSnap ? jobsSnap.size : 0,
      newRealEstate: realEstateSnap ? realEstateSnap.size : 0,
      newItems: itemsSnap ? itemsSnap.size : 0,
      jobsSample: jobsSnap ? jobsSnap.docs.slice(0, 3).map(d => ({ id: d.id, ...d.data() })) : [],
    };
  } catch (e) {
    console.warn('[이메일] 신규 채용/부동산/중고 fetch 실패 (섹션 생략):', e.message);
    return { newJobs: 0, newRealEstate: 0, newItems: 0, jobsSample: [] };
  }
}

const prisma = new PrismaClient();

function generateCardNewsHtml(dateString, cardImageUrl, terminalUrl, newsItems, promoCards = [], appFunnel = null) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr';
  const trackUrl = (target, type) => {
    if (!target) return '#';
    return `${baseUrl}/api/click?url=${encodeURIComponent(target)}&type=${type}`;
  };

  const trackedTerminalUrl = trackUrl(terminalUrl, 'TERMINAL');

  // 상단 가벼운 배너: "왜 앱인가" (실시간/푸시) — 본문 보러 온 사용자가 첫 화면에서 보게 함
  // 하단 PromoCard 6 은 "어떻게 받나" (QR/다운로드) — 역할 분리로 spammy 회피
  const topBannerUrl = 'https://chaovietnam-login.web.app/go/app?utm_source=email&utm_medium=newsletter&utm_content=email_top_banner';
  const topBannerHtml = `
    <a href="${topBannerUrl}" target="_blank" style="text-decoration:none;display:block;margin-bottom:20px;">
      <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:#7c2d12;">
        <span style="line-height:1.4;">📱 <strong>매일 이메일 + 실시간 알림</strong>은 앱에서. 24년 베트남 한인 미디어, 이제 모바일로.</span>
        <span style="background:#f97316;color:#fff;padding:6px 14px;border-radius:6px;font-weight:700;white-space:nowrap;font-size:12px;">앱 설치 →</span>
      </div>
    </a>
  `;

  let html = `
    <div style="font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; max-width: 700px; margin: 0 auto; color: #333; padding: 20px; background-color: #fff;">
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">
        씬짜오베트남 데일리뉴스 | ${dateString}
      </h2>
      <h1 style="font-size: 24px; color: #d1121d; margin-bottom: 20px;">
        씬짜오베트남 오늘의 뉴스
      </h1>
      ${topBannerHtml}
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

  // 깔때기 단계 1 보강: 최근 24시간 새 채용·부동산·중고 알림 (3채널 동기화)
  // 환영화면(가입 후) + 비회원 뉴스탭 카드 + 이메일 = 같은 메시지 노출로 인지 일관성
  if (appFunnel && (appFunnel.newJobs > 0 || appFunnel.newRealEstate > 0 || appFunnel.newItems > 0)) {
    const appBannerUrl = 'https://chaovietnam-login.web.app/go/app?utm_source=email&utm_medium=newsletter&utm_content=daily_app_funnel';
    const parts = [];
    if (appFunnel.newJobs > 0) parts.push(`💼 새 채용 <strong>${appFunnel.newJobs}건</strong>`);
    if (appFunnel.newRealEstate > 0) parts.push(`🏠 새 매물 <strong>${appFunnel.newRealEstate}건</strong>`);
    if (appFunnel.newItems > 0) parts.push(`🛒 새 물품 <strong>${appFunnel.newItems}건</strong>`);
    html += `
      <div style="margin: 30px 0; padding: 16px 18px; background: linear-gradient(135deg, #fff8f0 0%, #fef3e2 100%); border-left: 4px solid #f97316; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #c2410c;">
          📲 오늘 (24시간) 베트남 한인 사회 새 소식
        </p>
        <p style="margin: 0 0 10px 0; font-size: 13px; color: #555; line-height: 1.6;">
          ${parts.join(' · ')}이 등록되었습니다.
        </p>
        <a href="${appBannerUrl}" target="_blank" style="display: inline-block; padding: 8px 16px; background: #f97316; color: #fff; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 700;">
          앱에서 자세히 보기 →
        </a>
      </div>
    `;
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

      // 앱 다운로드 카드는 description 안에 이미 자체 CTA 버튼이 있으므로 외부 "자세히 보기" 생략
      const moreButtonHtml = card.category === 'app' ? '' : `
          <a href="${trackedPromoUrl}" target="_blank"
            style="display:inline-block;margin-top:10px;padding:8px 20px;background:#f97316;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;">
            자세히 보기 →
          </a>`;

      html += `
        <div style="margin-bottom:16px;background:#fff;border:1px solid #fed7aa;border-radius:10px;padding:16px;">
          ${imgHtml}
          <h3 style="margin:0 0 4px 0;font-size:15px;font-weight:bold;">
            <a href="${trackedPromoUrl}" target="_blank" style="color:#c2410c;text-decoration:none;">${card.title}</a>
          </h3>
          ${descHtml}${moreButtonHtml}
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

    // 활성 홍보카드 DB에서 로드 + 요일 + 채널(email) 필터 (lib/promo-card-filters.js 공통 로직)
    console.log('Fetching active promo cards...');
    const allPromoCards = await prisma.promoCard.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    const promoCards = filterCardsForToday(allPromoCards, new Date(), 'email');
    const dow = getVietnamIsoWeekday();
    console.log(`Found ${allPromoCards.length} active promo cards, ${promoCards.length} for today (요일=${dow}).`);

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

    // 깔때기 단계 1 보강: 신규 채용/부동산 카운트 (실패해도 이메일 전체 흐름 OK)
    const appFunnel = await fetchRecentJobsAndRealEstate();
    console.log(`[이메일] 신규 채용 ${appFunnel.newJobs}건, 신규 부동산 ${appFunnel.newRealEstate}건`);

    const htmlContent = generateCardNewsHtml(todayString, cardImageUrl, terminalUrl, orderedItems, promoCards, appFunnel);
    const subject = `[씬짜오베트남] 데일리뉴스 | ${todayString}`;

    const recipientEmails = isTest
      ? [process.env.TEST_EMAIL || 'test@example.com']
      : subscribers.map(s => s.email);

    console.log(`Sending email to ${recipientEmails.length} recipients...`);
    const sendResult = await sendNewsletterWithFallback(recipientEmails, subject, htmlContent, { forceSmtp: true });
    console.log(`Daily digest email sent. Method: ${sendResult.method} | 성공: ${sendResult.succeeded} | 실패: ${sendResult.failed}`);

    // 🔍 [측정 인프라 Phase 4] 카톡 오픈채팅용 텍스트 자동 출력
    //   - 카톡 봇이 없으므로 사용자가 *수동으로 복사·붙여넣기* 함
    //   - kakao-out/YYYY-MM-DD.txt 파일에 저장 + 콘솔에도 출력
    try {
        const kakaoText = buildKakaoBroadcastText(orderedItems, {
            terminalUrl,
            dateString: todayString,
        });
        const outDir = path.join(process.cwd(), 'kakao-out');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, `${vnDateStr}.txt`);
        fs.writeFileSync(outFile, kakaoText, 'utf8');
        console.log('\n========== 카톡 오픈채팅 복사용 텍스트 ==========');
        console.log(kakaoText);
        console.log('==================================================');
        console.log(`📂 저장 위치: ${outFile}\n`);
    } catch (kakaoErr) {
        console.error('카톡 텍스트 생성 실패 (이메일 발송에는 영향 없음):', kakaoErr.message);
    }

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
