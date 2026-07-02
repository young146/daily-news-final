// ════════════════════════════════════════════════════════════════
// 주간 인기 검색어 수집 (Weekly popular keyword fetch)
// ────────────────────────────────────────────────────────────────
// 무엇: 네이버 검색광고 API(keywordstool)로 베트남 관련 실제 검색량을 조회해
//       카테고리별 인기 검색어를 lib/popular-keywords.generated.js 에 기록한다.
// 언제: 주 1회 수동 실행 → `npm run keywords`  (나중에 cron/Actions로 자동화 가능)
// 결과: 이 파일이 lib/popular-keywords.generated.js 를 덮어쓴다. git commit 하면
//       (배포 시) 최신 인기 검색어가 번역 프롬프트에 반영된다.
//
// 안전장치: API 키가 없으면 경고만 출력하고 종료(exit 0). 기존 generated 파일과
//           baseline 키워드는 그대로 유지되므로 시스템은 계속 정상 동작한다.
//
// 필요한 환경변수(.env):
//   NAVER_SEARCHAD_API_KEY     — 네이버 검색광고 API 액세스 라이선스
//   NAVER_SEARCHAD_SECRET      — 비밀키
//   NAVER_SEARCHAD_CUSTOMER_ID — 고객(계정) ID
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_KEY = process.env.NAVER_SEARCHAD_API_KEY;
const SECRET = process.env.NAVER_SEARCHAD_SECRET;
const CUSTOMER_ID = process.env.NAVER_SEARCHAD_CUSTOMER_ID;

const BASE_URL = 'https://api.searchad.naver.com';
const KEYWORD_URI = '/keywordstool';

// 카테고리별 시드 키워드 (네이버에 "이 주제 연관 검색어 뽑아줘"라고 던지는 씨앗)
// ⚠️ lib/popular-keywords.js 의 카테고리 키와 일치시킬 것.
const SEEDS = {
  Economy: ['베트남 환율', '베트남 경제', '베트남 최저임금'],
  'Real Estate': ['베트남 부동산', '하노이 아파트', '호찌민 부동산'],
  Travel: ['다낭 여행', '나트랑 여행', '푸꾸옥 여행'],
  Food: ['베트남 쌀국수', '베트남 음식', '베트남 커피'],
  Society: ['베트남 뉴스', '베트남 날씨'],
  Politics: ['베트남 정치', '베트남 총리'],
  International: ['베트남 관세', '베트남 미국'],
  'Korea-Vietnam': ['베트남 비자', '베트남 취업', '베트남 한인'],
  Community: ['베트남 교민', '베트남 한인회'],
  Health: ['베트남 병원', '베트남 뎅기열'],
  Culture: ['베트남 축구', '베트남 문화'],
};

// 베트남 관련 여부 필터 — 네이버가 주제와 무관한 연관어를 섞어주므로 걸러낸다.
const VN_TOKENS = [
  '베트남', '다낭', '하노이', '호찌민', '나트랑', '나짱', '푸꾸옥', '달랏', '호이안',
  '하롱', '사파', '붕따우', '동 환율', '베트남동', '비엣', '베트남어', '월남',
];

function isVietnamRelated(kw) {
  return VN_TOKENS.some((t) => kw.includes(t));
}

// 네이버 검색광고 API 서명 (HMAC-SHA256, base64)
function makeSignature(timestamp, method, uri) {
  const msg = `${timestamp}.${method}.${uri}`;
  return crypto.createHmac('sha256', SECRET).update(msg).digest('base64');
}

// monthlyPcQcCnt/MobileQcCnt 는 "< 10" 같은 문자열일 수 있음 → 숫자화
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    if (v.includes('<')) return 5; // "< 10" → 대략 5로 취급
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchRelatedKeywords(hintKeywords) {
  const timestamp = Date.now().toString();
  const signature = makeSignature(timestamp, 'GET', KEYWORD_URI);
  const resp = await axios.get(`${BASE_URL}${KEYWORD_URI}`, {
    params: { hintKeywords: hintKeywords.join(','), showDetail: 1 },
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': API_KEY,
      'X-Customer': CUSTOMER_ID,
      'X-Signature': signature,
    },
    timeout: 20000,
  });
  return resp.data?.keywordList || [];
}

async function main() {
  if (!API_KEY || !SECRET || !CUSTOMER_ID) {
    console.warn('[keywords] ⚠️ 네이버 검색광고 API 키가 없습니다. baseline 키워드를 그대로 유지하고 종료합니다.');
    console.warn('[keywords]   설정하려면 .env 에 NAVER_SEARCHAD_API_KEY / _SECRET / _CUSTOMER_ID 를 추가하세요.');
    process.exit(0);
  }

  const byCategory = {};
  for (const [category, seeds] of Object.entries(SEEDS)) {
    try {
      console.log(`[keywords] ${category} 조회 중... (seeds: ${seeds.join(', ')})`);
      const list = await fetchRelatedKeywords(seeds);

      const scored = list
        .map((k) => ({
          keyword: (k.relKeyword || '').trim(),
          volume: toNumber(k.monthlyPcQcCnt) + toNumber(k.monthlyMobileQcCnt),
        }))
        .filter((k) => k.keyword && isVietnamRelated(k.keyword))
        .sort((a, b) => b.volume - a.volume);

      // 중복 제거 + 상위 10개
      const seen = new Set();
      const top = [];
      for (const k of scored) {
        if (!seen.has(k.keyword)) {
          seen.add(k.keyword);
          top.push(k);
        }
        if (top.length >= 10) break;
      }

      byCategory[category] = top;
      console.log(`[keywords]   → ${top.length}개 수집 (1위: ${top[0]?.keyword || '없음'})`);
      await sleep(500); // rate limit 여유
    } catch (e) {
      const status = e.response?.status;
      console.error(`[keywords] ${category} 실패 (${status || ''}): ${e.message}`);
      // 실패한 카테고리는 비워두면 lib에서 baseline으로 폴백됨 → 안전
    }
  }

  const totalKw = Object.values(byCategory).reduce((n, arr) => n + arr.length, 0);
  if (totalKw === 0) {
    console.warn('[keywords] ⚠️ 수집된 키워드가 0개입니다. 기존 파일을 덮어쓰지 않고 종료합니다.');
    process.exit(0);
  }

  const outPath = path.join(__dirname, '..', 'lib', 'popular-keywords.generated.js');
  const nowIso = new Date().toISOString();
  const content = `// ⚠️ AUTO-GENERATED — 손으로 수정하지 말 것.
// scripts/fetch-popular-keywords.js 가 주 1회 실행되며 이 파일을 덮어씁니다.
// 파일이 비어 있어도(아래 byCategory 가 {}) baseline 키워드로 정상 동작합니다.
//
// 형식: byCategory[카테고리] = [{ keyword, volume }] (volume 내림차순)
export const WEEKLY_KEYWORDS = ${JSON.stringify({ updatedAt: nowIso, byCategory }, null, 2)};
`;

  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`[keywords] ✅ 저장 완료: ${outPath}`);
  console.log(`[keywords]   갱신시각 ${nowIso}, 총 ${totalKw}개 키워드`);
  console.log('[keywords]   변경사항을 git commit 하면 다음 배포부터 번역에 반영됩니다.');
}

main().catch((e) => {
  console.error('[keywords] 치명적 오류:', e);
  process.exit(1);
});
