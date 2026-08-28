/**
 * 뉴스레터 구독 모집 카드 생성기
 * =====================================================================
 * 무엇을 만드나: 같은 내용의 카드를 두 규격으로 뽑는다.
 *   · card-subscribe-16x9.png  (1672×941) — 이메일 광고 슬롯 · 앱 · 웹.
 *                               기존 자체홍보 카드와 **같은 비율**이라 그대로 갈아 끼운다.
 *   · card-subscribe-1x1.png   (1080×1080) — 카카오톡 오픈방 · 페이스북 · 인스타.
 *   · card-subscribe-og.png    (1200×630)  — **카톡·페북에 링크를 올렸을 때 뜨는 미리보기**.
 *                                그림만 올리면 눌리지 않는다. 링크를 올려야 눌린다.
 *   · card-subscribe-3x1.png   (2172×724)  — **앱·웹 광고 슬롯**. 기존 광고 실측이 3:1 이었다.
 *                                (16:9 를 그대로 넣으면 잘리거나 여백이 생긴다)
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
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:30px">
          <img src="${logo}" style="width:230px;display:block">
          <div style="font-size:31px;font-weight:900;color:${HEAD};letter-spacing:-.03em;
                      border-left:2px solid #E4D8CB;padding-left:16px">씬짜오 데일리뉴스</div>
        </div>
        <div style="font-size:34px;font-weight:700;color:${ORANGE_DEEP};letter-spacing:-.02em">매일 아침,</div>
        <div style="font-size:76px;font-weight:900;line-height:1.14;letter-spacing:-.035em;margin-top:4px">
          베트남이 <span style="color:${ORANGE_DEEP}">정리되어</span><br>옵니다
        </div>
        <div style="font-size:31px;font-weight:500;color:#5B5048;margin-top:26px;line-height:1.5">
          베트남 거주 교민·기업인·주재원을 위한<br>
          <span class="num">베트남 생활의 필수 정보</span>
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
      <div style="font-size:32px;font-weight:900;color:${HEAD};margin-top:12px;letter-spacing:-.03em">
        씬짜오 데일리뉴스</div>
      <div style="font-size:30px;font-weight:700;color:${ORANGE_DEEP};margin-top:18px">매일 아침,</div>
      <div style="font-size:69px;font-weight:900;line-height:1.16;letter-spacing:-.035em;margin-top:2px">
        베트남이 <span style="color:${ORANGE_DEEP}">정리되어</span> 옵니다
      </div>
      <div style="font-size:27px;font-weight:500;color:#5B5048;margin-top:16px;line-height:1.5">
        베트남 거주 교민·기업인·주재원을 위한<br><span class="num">베트남 생활의 필수 정보</span>
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

  // ▸ 3:1 — 앱·웹 **광고 슬롯**용. 실측한 기존 광고들이 3:1(750×250 · 2172×724)이었다.
  //   위치마다 3.0~3.9:1 로 제각각이라 **가장자리는 잘릴 수 있다고 보고**
  //   중요한 것을 중앙 쪽에 모은다. 미리보기 종이는 넣지 않는다 — 이 비율에서는
  //   납작해져 무슨 그림인지 알아볼 수 없다.
  const wb = 2172;
  const hb = 724;
  const htmlBanner = shell(
    wb,
    hb,
    `
    <!-- 왼쪽 오렌지 띠: 광고 슬롯은 남의 배너와 나란히 놓인다. 크림 바탕만으로는
         묻히므로 시선을 잡아 줄 세로 띠를 둔다(잘려도 손해가 없는 자리다). -->
    <div style="position:absolute;left:0;top:0;bottom:0;width:22px;background:${ORANGE}"></div>
    <div style="flex:1;display:flex;align-items:center;justify-content:space-between;
                padding:52px 92px 52px 108px;gap:64px">
      <div style="flex:1 1 auto;min-width:0">
        <div style="display:flex;align-items:center;gap:18px;margin-bottom:18px">
          <img src="${logo}" style="width:300px;display:block">
          <div style="font-size:38px;font-weight:900;color:${HEAD};letter-spacing:-.03em;
                      border-left:3px solid #E4D8CB;padding-left:18px">씬짜오 데일리뉴스</div>
        </div>
        <div style="font-size:96px;font-weight:900;line-height:1.1;letter-spacing:-.04em;white-space:nowrap">
          매일 아침, 베트남이 <span style="color:${ORANGE_DEEP}">정리되어</span> 옵니다
        </div>
        <div style="font-size:46px;font-weight:500;color:#5B5048;margin-top:20px;white-space:nowrap">
          베트남 거주 교민·기업인·주재원을 위한 <span class="num">베트남 생활의 필수 정보</span>
        </div>
      </div>
      <div style="flex:0 0 auto;text-align:center">
        <div class="cta" style="padding:34px 62px;font-size:54px">무료 구독 <span style="opacity:.85">→</span></div>
        <div style="font-size:40px;font-weight:700;color:${ORANGE_DEEP};margin-top:18px">${SHORT_URL}</div>
      </div>
    </div>`,
  );

  // ▸ 1200×630 — **카톡·페북에 링크를 올렸을 때 뜨는 미리보기 그림**.
  //   이미지를 따로 올리는 것보다 이 길이 낫다 — 그림은 눌리지 않지만,
  //   링크는 미리보기가 뜨고 **그 미리보기를 누르면 신청 페이지로 간다.**
  //   카톡 미리보기는 손톱만 하게 줄어드니 요소를 줄이고 글자를 키운다.
  const wo = 1200;
  const ho = 630;
  const htmlOg = shell(
    wo,
    ho,
    `
    <div style="position:absolute;left:0;top:0;bottom:0;width:16px;background:${ORANGE}"></div>
    <div style="flex:1;display:flex;flex-direction:column;justify-content:center;
                padding:0 72px 0 88px">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:26px">
        <img src="${logo}" style="width:224px;display:block">
        <div style="font-size:30px;font-weight:900;color:${HEAD};letter-spacing:-.03em;
                    border-left:2px solid #E4D8CB;padding-left:16px">씬짜오 데일리뉴스</div>
      </div>
      <div style="font-size:34px;font-weight:700;color:${ORANGE_DEEP}">매일 아침,</div>
      <div style="font-size:76px;font-weight:900;line-height:1.14;letter-spacing:-.04em;margin-top:4px">
        베트남이 <span style="color:${ORANGE_DEEP}">정리되어</span> 옵니다
      </div>
      <div style="font-size:31px;font-weight:500;color:#5B5048;margin-top:22px;line-height:1.5">
        베트남 거주 교민·기업인·주재원을 위한<br>
        <span class="num">베트남 생활의 필수 정보</span>
      </div>
      <div class="cta" style="margin-top:34px;padding:22px 44px;font-size:34px;align-self:flex-start">
        무료 구독 신청 <span style="opacity:.85">→</span>
      </div>
    </div>`,
  );

  for (const [name, html, w, h] of [
    ['card-subscribe-16x9.png', html16x9, w9, h9],
    ['card-subscribe-1x1.png', html1x1, s, s],
    ['card-subscribe-3x1.png', htmlBanner, wb, hb],
    ['card-subscribe-og.png', htmlOg, wo, ho],
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
