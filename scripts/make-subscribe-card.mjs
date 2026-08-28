/**
 * 뉴스레터 구독 모집 카드 생성기
 * =====================================================================
 * 무엇을 만드나: 같은 내용의 카드를 두 규격으로 뽑는다.
 *   · card-subscribe-16x9.png  (1672×941) — 이메일 광고 슬롯 · 앱 · 웹.
 *                               기존 자체홍보 카드와 **같은 비율**이라 그대로 갈아 끼운다.
 *   · card-subscribe-1x1.png   (1080×1080) — 카카오톡 오픈방 · 페이스북 · 인스타.
 *
 * 왜 손으로 그리지 않고 스크립트로 만드나:
 *   구독자 수는 계속 는다. 숫자가 박힌 그림을 손으로 고치면 반드시 낡은 채로 남는다.
 *   여기서는 **명부를 직접 세어** 그 자리에 넣으므로, 다시 돌리기만 하면 최신이 된다.
 *
 * 왜 진짜 뉴스레터를 안에 넣나:
 *   "무엇이 오는지" 는 설명하는 것보다 **한 장 보여주는 게 빠르다.**
 *   그래서 오늘 자 실제 기사로 메일을 렌더링해 그 위쪽을 오려 붙인다.
 *   광고 칸은 뺀다 — 구독 권유 카드 안에 남의 광고가 보이면 초점이 흐려진다.
 *
 * 쓰는 법:  node scripts/make-subscribe-card.mjs
 * 나오는 곳: .tmp/cards/
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import { renderDailyNewsEmail } from '../lib/newsletter-template.js';

const OUT = path.join(process.cwd(), '.tmp', 'cards');
fs.mkdirSync(OUT, { recursive: true });

// 뉴스레터와 같은 색을 쓴다 — 카드에서 본 색이 메일에서 그대로 나와야
// "그때 그거" 로 이어진다. 색이 다르면 매번 처음 보는 것이 된다.
const ORANGE = '#F97316';
const ORANGE_DEEP = '#EA580C';
const NAVY = '#16305C'; // 기존 자체홍보 카드의 남색 계열
const CREAM = '#FDF9F4';
const HEAD = '#231A14';

const SHORT_URL = 'vnkorlife.com/s';

/** 파일을 data URI 로 — 브라우저에 넘길 HTML 이 자기 완결이어야 한다 */
function dataUri(file, mime) {
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/**
 * 명부를 세어 **백 단위로 내림**한다.
 * 왜 내림인가: 넘겨 말하지 않기 위해서다. 6,651명을 7,000명이라 하면 거짓이 된다.
 * 왜 천 단위가 아닌 백 단위인가: 6,651명을 '6,000명 넘게' 라고 하면 이번엔 지나치게
 *   깎아 말하는 것이고, 무엇보다 **구체적인 숫자가 더 믿음직하다.**
 */
function roundDownHundred(n) {
  return Math.floor(n / 100) * 100;
}

async function main() {
  const prisma = new PrismaClient();

  // ── 1. 숫자는 명부에서 직접 센다 ────────────────────────────────
  const activeCount = await prisma.subscriber.count({ where: { isActive: true } });
  const shown = roundDownHundred(activeCount).toLocaleString('ko-KR');
  console.log(`활성 구독자 ${activeCount.toLocaleString('ko-KR')}명 → 카드 표기 "${shown}명 넘게"`);

  // ── 2. 안에 넣을 뉴스레터를 실제 기사로 렌더링 ──────────────────
  const recent = await prisma.newsItem.findMany({
    where: { isPublishedMain: true, wordpressUrl: { not: null } },
    orderBy: { publishedAt: 'desc' },
    take: 12,
    select: {
      title: true,
      translatedTitle: true,
      imageUrl: true,
      wordpressImageUrl: true,
      wordpressUrl: true,
      category: true,
    },
  });
  const toRow = (i) => ({
    title: i.translatedTitle || i.title || '',
    imageUrl: i.wordpressImageUrl || i.imageUrl || '',
    url: i.wordpressUrl || '#',
  });
  const cat = (i) => (i.category || '').toLowerCase();
  const isKorea = (i) => cat(i).includes('korea');
  // 국제·연예 기사는 미리보기에서 뺀다 — 실제로 메일에는 실리지만, 카드는
  // "베트남이 정리되어 온다" 고 말하고 있다. 그림이 말을 배신하면 안 된다.
  const isVietStory = (i) => !isKorea(i) && !cat(i).includes('international');
  const korea = recent.filter(isKorea);
  const viet = recent.filter(isVietStory);

  const dateString = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());

  const mailHtml = renderDailyNewsEmail({
    dateString,
    cardImageUrl: '', // 큰 사진은 뺀다 — 미리보기에서는 목록이 더 잘 읽힌다
    terminalUrl: 'https://chaovietnam.co.kr',
    newsItems: [...viet, ...recent.filter((i) => !viet.includes(i) && !isKorea(i))]
      .slice(0, 5)
      .map(toRow),
    koreaNews: korea.slice(0, 2).map(toRow),
    promoCards: [], // 광고는 넣지 않는다 (초점 분산)
    brand: { publisherName: '씬짜오베트남', publisherNameEn: 'XIN CHAO VIETNAM' },
    baseUrl: 'https://chaovietnam.co.kr',
  });
  await prisma.$disconnect();

  // ── 3. 브라우저 ─────────────────────────────────────────────────
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--font-render-hinting=none', '--force-color-profile=srgb'],
  });

  // 3-a. 뉴스레터 위쪽을 오려 미리보기 이미지로
  const p1 = await browser.newPage();
  await p1.setViewport({ width: 1040, height: 1500, deviceScaleFactor: 2 });
  await p1.setContent(mailHtml, { waitUntil: 'networkidle0', timeout: 60000 });
  const previewPath = path.join(OUT, '_mail-preview.png');
  await p1.screenshot({
    path: previewPath,
    clip: { x: 0, y: 0, width: 1040, height: 1180 },
  });
  await p1.close();
  console.log('뉴스레터 미리보기 캡처 완료');

  const preview = dataUri(previewPath, 'image/png');
  const logo = dataUri(path.join(process.cwd(), 'public', 'logo-full.png'), 'image/png');

  // ── 4. 카드 두 장 ───────────────────────────────────────────────
  const shell = (w, h, inner) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${w}px;height:${h}px;overflow:hidden;
       font-family:'Noto Sans KR','Malgun Gothic',sans-serif;
       background:${CREAM};color:${HEAD};-webkit-font-smoothing:antialiased}
  .wrap{width:${w}px;height:${h}px;position:relative;display:flex;flex-direction:column}
  /* 미리보기는 그림자 준 종이처럼 — 실물 느낌이 있어야 "이게 오는 거구나" 가 된다 */
  .paper{border-radius:18px;overflow:hidden;background:#fff;
         box-shadow:0 30px 70px rgba(35,26,20,.22),0 4px 14px rgba(35,26,20,.10)}
  .paper img{display:block;width:100%}
  .cta{display:inline-flex;align-items:center;gap:14px;background:${ORANGE};color:#fff;
       border-radius:999px;font-weight:900;box-shadow:0 10px 26px rgba(249,115,22,.36)}
  .num{color:${ORANGE_DEEP};font-weight:900}
  .foot{background:${NAVY};color:#fff;display:flex;align-items:center;justify-content:center;gap:18px}
</style></head><body><div class="wrap">${inner}</div></body></html>`;

  const chips = [
    ['매일 아침', '거르지 않고'],
    ['25년', '한인 매거진이'],
    ['1분', '읽는 데'],
  ];

  // ▸ 16:9 — 왼쪽에 말, 오른쪽에 실물
  const w9 = 1672;
  const h9 = 941;
  const html16x9 = shell(
    w9,
    h9,
    `
    <div style="flex:1;display:flex;align-items:center;padding:56px 0 40px 72px;gap:48px">
      <div style="width:830px;flex:none">
        <img src="${logo}" style="width:270px;display:block;margin-bottom:34px">
        <div style="font-size:34px;font-weight:700;color:${ORANGE_DEEP};letter-spacing:-.02em">매일 아침,</div>
        <div style="font-size:76px;font-weight:900;line-height:1.14;letter-spacing:-.035em;margin-top:4px">
          베트남이 <span style="color:${ORANGE_DEEP}">정리되어</span><br>옵니다
        </div>
        <div style="font-size:31px;font-weight:500;color:#5B5048;margin-top:26px;line-height:1.5">
          현지 뉴스와 한국 소식을 한 통에.<br>
          <span class="num">${shown}명</span> 넘는 교민·주재원·기업인이 읽고 있습니다.
        </div>
        <div style="display:flex;gap:14px;margin-top:34px">
          ${chips
            .map(
              ([a, b]) => `<div style="background:#fff;border:2px solid #FBD9BE;border-radius:16px;
                 padding:16px 26px;text-align:center">
              <div style="font-size:17px;color:#8A7C70;font-weight:500">${b}</div>
              <div style="font-size:30px;font-weight:900;color:${HEAD};margin-top:2px">${a}</div>
            </div>`,
            )
            .join('')}
        </div>
        <div class="cta" style="margin-top:38px;padding:24px 46px;font-size:35px">
          무료 구독 신청 <span style="opacity:.85">→</span>
          <span style="background:rgba(255,255,255,.22);border-radius:999px;padding:8px 22px;font-size:31px">
            ${SHORT_URL}</span>
        </div>
      </div>
      <div class="paper" style="width:640px;height:748px;transform:rotate(2.2deg)">
        <img src="${preview}">
      </div>
    </div>
    <div class="foot" style="height:86px;font-size:25px;font-weight:500">
      <span style="font-weight:900">씬짜오베트남 데일리뉴스</span>
      <span style="opacity:.45">|</span><span>chaovietnam.co.kr</span>
      <span style="opacity:.45">|</span><span>카카오톡 ID xinchao0403</span>
    </div>`,
  );

  // ▸ 1:1 — SNS. 손바닥만 하게 보이므로 글자를 더 크게, 요소를 줄인다
  const s = 1080;
  const html1x1 = shell(
    s,
    s,
    `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;
                padding:44px 56px 0;text-align:center">
      <img src="${logo}" style="width:224px;display:block">
      <div style="font-size:30px;font-weight:700;color:${ORANGE_DEEP};margin-top:22px">매일 아침,</div>
      <div style="font-size:69px;font-weight:900;line-height:1.16;letter-spacing:-.035em;margin-top:2px">
        베트남이 <span style="color:${ORANGE_DEEP}">정리되어</span> 옵니다
      </div>
      <div style="font-size:27px;font-weight:500;color:#5B5048;margin-top:16px;line-height:1.5">
        <span class="num">${shown}명</span> 넘는 교민·주재원·기업인이 읽고 있습니다
      </div>
      <div class="cta" style="margin-top:26px;padding:19px 40px;font-size:32px">
        무료 구독 <span style="opacity:.85">→</span>
        <span style="background:rgba(255,255,255,.22);border-radius:999px;padding:6px 18px;font-size:29px">
          ${SHORT_URL}</span>
      </div>
      <!-- 미리보기는 아래로 흘려보낸다: 잘려도 "더 있다" 는 느낌이라 손해가 아니다 -->
      <div class="paper" style="width:700px;margin-top:28px;flex:none">
        <img src="${preview}">
      </div>
    </div>`,
  );

  for (const [name, html, w, h] of [
    ['card-subscribe-16x9.png', html16x9, w9, h9],
    ['card-subscribe-1x1.png', html1x1, s, s],
  ]) {
    const pg = await browser.newPage();
    await pg.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await pg.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await pg.evaluate(() => document.fonts.ready);
    const out = path.join(OUT, name);
    await pg.screenshot({ path: out });
    await pg.close();
    console.log(`OK ${out}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
