// ════════════════════════════════════════════════════════════════
// 인기 검색어 풀 (Popular search keyword pool)
// ────────────────────────────────────────────────────────────────
// 목적: 번역 시 제목에 "실제 한국 독자가 검색하는 인기 검색어"를 자연스럽게
//       녹여 SEO 트래픽을 높인다. (모델이 상상한 검색어가 아니라 실제 데이터 기반)
//
// 2층 구조:
//   ① BASELINE — 손으로 큐레이션한 베트남 관련 상시(evergreen) 인기 검색어.
//                API 없이도 항상 동작. 여기가 기본값.
//   ② WEEKLY   — scripts/fetch-popular-keywords.js 가 주 1회 네이버 검색광고 API로
//                실제 검색량을 조회해 popular-keywords.generated.js 에 기록.
//                있으면 baseline 보다 우선 적용(최신 반영).
//
// 카테고리 키는 translator.js 의 분류 카테고리와 일치시킨다.
// ════════════════════════════════════════════════════════════════
import { WEEKLY_KEYWORDS } from './popular-keywords.generated.js';

// ── ① 기본(baseline) 인기 검색어 — 무료·즉시·안정 ─────────────────
const BASELINE = {
  Economy: ['베트남 환율', '동 환율', '베트남 환전', '베트남 최저임금', '베트남 경제', '베트남 물가', '베트남 주식', '베트남 투자'],
  'Real Estate': ['베트남 부동산', '베트남 아파트 임대', '하노이 아파트', '호찌민 부동산', '베트남 집값', '베트남 아파트'],
  Travel: ['다낭 여행', '나트랑 여행', '푸꾸옥 여행', '베트남 한달살기', '하노이 여행', '호이안 여행', '달랏 여행', '베트남 여행', '베트남 항공권'],
  Food: ['베트남 쌀국수', '반미', '분짜', '베트남 과일', '베트남 음식', '베트남 커피'],
  Society: ['베트남 뉴스', '베트남 메트로', '베트남 자동차 가격', '베트남 사건', '베트남 날씨', '베트남 사회'],
  Politics: ['베트남 정치', '베트남 총리', '베트남 정책', '베트남 정부'],
  International: ['베트남 미국', '베트남 중국', '베트남 관세'],
  'Korea-Vietnam': ['베트남 비자', '베트남 취업', '베트남 한인', '한베', '베트남 진출기업'],
  Community: ['베트남 교민', '베트남 이사', '해외이사', '베트남 거주 신고', '하노이 한인', '호찌민 한인', '베트남 한인회', '베트남 코참'],
  Health: ['베트남 병원', '베트남 뎅기열', '베트남 건강', '베트남 예방접종'],
  Culture: ['베트남 축구', '베트남 문화', '베트남 연예', '베트남 드라마'],
  Other: ['베트남', '베트남 뉴스'],
};

// 카테고리 매칭이 안 될 때의 광역 폴백 (가장 검색량 큰 상시 키워드)
const GENERAL = ['베트남', '베트남 뉴스', '베트남 환율', '다낭 여행', '베트남 비자', '베트남 부동산'];

// ── 주간 키워드를 문자열 배열로 정규화 ({keyword,volume} → keyword) ──
function weeklyFor(category) {
  const list = WEEKLY_KEYWORDS?.byCategory?.[category];
  if (!Array.isArray(list)) return [];
  return list.map((k) => (typeof k === 'string' ? k : k?.keyword)).filter(Boolean);
}

/**
 * 특정 카테고리에 대한 인기 검색어 목록을 반환.
 * 우선순위: 주간(실측) → baseline → general. 중복 제거 후 max개.
 */
export function getPopularKeywords(category, max = 8) {
  const base = BASELINE[category] || [];
  const merged = [...weeklyFor(category), ...base, ...GENERAL];
  const seen = new Set();
  const out = [];
  for (const kw of merged) {
    if (kw && !seen.has(kw)) {
      seen.add(kw);
      out.push(kw);
    }
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 프롬프트에 삽입할 힌트 문자열. 키워드가 없으면 '' 반환(→ 삽입 스킵).
 */
export function formatKeywordHint(category) {
  const kws = getPopularKeywords(category);
  return kws.length ? kws.join(', ') : '';
}

// 주간 스크립트가 카테고리별로 분류할 때 참조하는 카테고리 목록
export const KEYWORD_CATEGORIES = Object.keys(BASELINE);
