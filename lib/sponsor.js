// ─────────────────────────────────────────────────────────────────────────────
// 명명권(스폰서) 브랜딩 — 단일 소스(Single Source of Truth)
//
// 핵심 원칙:
//   - 발행 책임은 항상 씬짜오(XinChao)에 남는다. 보낸사람 이름은 바꾸지 않는다.
//   - 스폰서가 "활성"일 때만 제목/본문 헤더/카드에 스폰서 이름·로고가 들어가고,
//     발행인 마스트헤드("XinChao Daily News")와 "SPONSORED BY · 후원" 표기로
//     "씬짜오가 제작 · 스폰서가 후원" 임을 명확히 한다.
//   - 비활성(기본)일 때는 기존 씬짜오 브랜딩 그대로 (동작 100% 동일).
//
// 저장: DB Setting 테이블의 단일 행(key='sponsorConfig', value=JSON).
//       테이블/행이 없거나 DB 오류여도 기본값으로 폴백 → 마이그레이션 전에도 안 깨짐.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from './prisma.js';

export const PUBLISHER_NAME = '씬짜오베트남';            // 발행인(기본 브랜드) — 한글
export const PUBLISHER_NAME_EN = 'XinChao Daily News';  // 발행인 영문 마스트헤드
export const PUBLISHER_TAGLINE = '24년 베트남 한인 미디어';

const SETTING_KEY = 'sponsorConfig';
const DEFAULT_CONFIG = { active: false, name: '', logoUrl: '' };

let _cache = null;
let _cacheTime = 0;
const TTL = 30 * 1000;

// Neon 서버리스 DB는 절전 후 첫 쿼리에서 "연결 불가"가 날 수 있다(깨어나는 중).
// 일시적 연결 오류면 짧게 기다렸다 재시도해 DB를 깨운다.
async function withRetry(fn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || "");
      const transient = e?.code === "P1001" || /reach database|database server|ECONNREFUSED|ETIMEDOUT|Connection.*closed/i.test(msg);
      if (!transient || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

// 현재 스폰서 설정을 읽는다. 항상 안전한 객체를 반환한다.
//   반환: { active, name, logoUrl }
export async function getSponsor() {
  if (_cache && Date.now() - _cacheTime < TTL) return _cache;
  let cfg = { ...DEFAULT_CONFIG };
  try {
    const row = await withRetry(() => prisma.setting.findUnique({ where: { key: SETTING_KEY } }));
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      cfg = {
        active: !!parsed.active,
        name: (parsed.name || '').trim(),
        logoUrl: (parsed.logoUrl || '').trim(),
      };
    }
  } catch (e) {
    // Setting 테이블 미생성 / DB 오류 → 기본값(비활성) 유지
  }
  // 이름이 비어 있으면 스폰서로 취급하지 않음
  if (!cfg.name) cfg.active = false;
  _cache = cfg;
  _cacheTime = Date.now();
  return cfg;
}

// 스폰서 설정을 저장한다. { active, name, logoUrl }
export async function setSponsor({ active, name, logoUrl }) {
  const cfg = {
    active: !!active,
    name: (name || '').trim(),
    logoUrl: (logoUrl || '').trim(),
  };
  await withRetry(() =>
    prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(cfg) },
      create: { key: SETTING_KEY, value: JSON.stringify(cfg) },
    })
  );
  _cache = null; // 캐시 무효화
  return cfg;
}

// 스폰서 적용 여부 (이름이 있고 active 인 경우만)
export function isSponsored(sponsor) {
  return !!(sponsor && sponsor.active && sponsor.name);
}

// ── 렌더 헬퍼 (순수 함수 — DB 의존 없음, 단위 테스트 가능) ───────────────────────

// 이메일 제목.  스폰서 → "[신한은행] 데일리뉴스 | 날짜", 기본 → "[씬짜오베트남] …"
export function emailSubject(sponsor, dateString) {
  const brand = isSponsored(sponsor) ? sponsor.name : PUBLISHER_NAME;
  return `[${brand}] 데일리뉴스 | ${dateString}`;
}

// 이메일 본문 상단(마스트헤드 + 헤더) HTML.
//   기존 buildEmailHtml 의 <h2>+<h1> 블록을 대체한다.
export function emailHeaderHtml(sponsor, dateString) {
  if (!isSponsored(sponsor)) {
    return `
    <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">${PUBLISHER_NAME} 데일리뉴스 | ${dateString}</h2>
    <h1 style="font-size: 24px; color: #d1121d; margin-bottom: 20px;">${PUBLISHER_NAME} 오늘의 뉴스</h1>`;
  }
  const badge = `<span style="display:inline-block; font-size:11px; color:#888; border:1px solid #ddd; border-radius:4px; padding:2px 8px; letter-spacing:1px; vertical-align:middle;">SPONSORED BY</span>`;
  const mark = sponsor.logoUrl
    ? `<img src="${sponsor.logoUrl}" alt="${sponsor.name}" style="height:40px; vertical-align:middle;" />`
    : `<span style="font-size:24px; color:#d1121d; font-weight:bold; vertical-align:middle;">${sponsor.name}</span>`;
  return `
    <h2 style="font-size: 15px; color: #666; margin-bottom: 14px;"><strong style="color:#444;">${PUBLISHER_NAME_EN}</strong> · ${PUBLISHER_TAGLINE} | ${dateString}</h2>
    <div style="margin-bottom: 20px;">${badge}&nbsp;&nbsp;${mark}</div>`;
}

// 카드 이미지 생성기(generateCardImageBuffer)에 넘길 옵션.
//   스폰서 → 로고+이름+책임 크레딧, 기본 → 씬짜오 텍스트.
export function cardImageSponsorOpts(sponsor) {
  if (!isSponsored(sponsor)) {
    return { sponsorName: PUBLISHER_NAME, sponsorLogoUrl: '', cardCredit: '' };
  }
  return {
    sponsorName: sponsor.name,
    sponsorLogoUrl: sponsor.logoUrl,
    cardCredit: `제작 · ${PUBLISHER_NAME_EN}    |    후원 · ${sponsor.name}`,
  };
}
