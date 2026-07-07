// ── 기사 하단 "제휴 추천" 블록 HTML 생성 ─────────────────────────────
// publisher.js 가 WordPress 발행 시 기사 본문 끝에 붙인다(관련 카테고리 한정).
// 원칙(메모리): "정보 없는 트래픽은 자산 아님" → 배너 도배 X, 정보형 큐레이션 + 제휴 고지.
//   - 하드뉴스(정치·국제·경제·한국핫뉴스)엔 안 붙임(브랜드 톤 보호).
//   - 카테고리별로 실제 관련 있는 제휴사만 노출.
//   - 링크는 우리 /go/<slug> 를 거침(교체·측정 통제). rel="nofollow sponsored"(구글 정책 준수).
import { AFFILIATE_LINKS, getAffiliate } from './affiliate-links.js';

// /go/ 리다이렉트 베이스 (daily-news-final Vercel). 커스텀 도메인 붙이면 env로 교체.
const GO_BASE = (process.env.GO_REDIRECT_BASE || 'https://daily-news-final.vercel.app') + '/go';

// 카테고리 → 추천 제휴사 slug(관련도 순). 빈 배열 = 블록 미표시. 없으면 DEFAULT.
const BY_CATEGORY = {
  Travel: ['airalo', 'aliexpress'],
  Food: ['aliexpress', 'taobao'],
  Health: ['airalo', 'aliexpress'],
  Community: ['aliexpress', 'taobao', 'airalo'],
  Society: ['aliexpress', 'taobao'],
  Culture: ['aliexpress', 'udemy'],
  'Real Estate': ['aliexpress'],
  'Korea-Vietnam': ['airalo', 'aliexpress'],
  // 하드뉴스 — 쇼핑 블록 제외(브랜드 톤 보호)
  Economy: [],
  Politics: [],
  International: [],
  'Korea-Hot': [],
};
const DEFAULT_SLUGS = ['aliexpress', 'taobao'];

// HTML escape (라벨 안전)
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 기사 하단 제휴 추천 블록 HTML 반환. 제외 카테고리거나 유효 제휴 없으면 '' (미표시).
 * @param {string} category - 기사 카테고리
 * @param {string} src - 성과추적용 위치 태그(예: 'news')
 */
export function buildAffiliateBlockHtml(category, src = 'news') {
  const list = (BY_CATEGORY[category] !== undefined) ? BY_CATEGORY[category] : DEFAULT_SLUGS;
  const slugs = list.filter((s) => getAffiliate(s)); // 딥링크 채워진 것만
  if (slugs.length === 0) return '';

  const cards = slugs.map((s) => {
    const a = AFFILIATE_LINKS[s];
    const url = `${GO_BASE}/${s}?src=${encodeURIComponent(src)}`;
    return `<a href="${url}" target="_blank" rel="nofollow sponsored noopener" style="display:inline-block;margin:5px 8px 5px 0;padding:9px 15px;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;color:#111827;text-decoration:none;font-size:14px;font-weight:600">${esc(a.label)} &rsaquo;</a>`;
  }).join('');

  return `
<div style="margin:30px 0 8px;padding:16px 18px;border:1px solid #f0e6da;border-radius:12px;background:#fffaf5">
  <div style="font-size:15px;font-weight:700;color:#c2410c;margin-bottom:3px">베트남 생활 &middot; 쇼핑 추천</div>
  <div style="font-size:12px;color:#9ca3af;margin-bottom:11px">교민이 자주 찾는 서비스 &mdash; 아래에서 바로 확인하세요</div>
  <div>${cards}</div>
  <div style="font-size:11px;color:#b3b3b3;margin-top:11px">* 제휴 링크입니다. 클릭·구매 시 씬짜오의 운영에 도움을 주시게 됩니다. (구매 가격은 동일합니다.)</div>
</div>`.trim();
}
