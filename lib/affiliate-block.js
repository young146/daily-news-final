// ── 기사 하단 "제휴 추천" 블록 HTML 생성 ─────────────────────────────
// publisher.js 가 WordPress 발행 시 기사 본문 끝에 붙인다.
//
// 2026-08-21 전면 개편 (사장님 지시: "글씨 버튼은 아무도 안 누른다 — 상품 이미지로"):
//   기존: /go/<slug> 텍스트 버튼 2개(알리·타오바오)  →  실제 클릭 거의 없음.
//   지금: **알리익스프레스 실제 상품 이미지 카드**(사진·할인율·가격) 가로 스크롤.
//   - 상품 데이터: AliExpress Portals → Ad Center → Hot Deals → Export(.xls) 를
//     `data/ali-products.json` 으로 변환해 둔 것. 갱신하려면 Export 다시 받아 교체.
//   - 이미지: ae-pic-a1.aliexpress-media.com 은 핫링크 허용(실측 200). 옛 alicdn 은 403이라 못 씀.
//   - 링크: Export 의 Promotion Url = 사장님 추적 포함 제휴링크(s.click.aliexpress.com).
//     ※ 이건 /go/ 를 거치지 않는다(알리 추적 파라미터를 그대로 살려야 수수료가 잡힘).
//   - 타오바오 제외(중국어 전용이라 교민에게 실효 없음 — 2026-08-21 결정).
//
// ⚠️ class 를 반드시 함께 넣는다 (2026-08-08 사장님 지적).
//    웹은 인라인 style 로 그려지지만 **앱(react-native-render-html)은 인라인 CSS 를 적용하지 않아**
//    classesStyles 로 클래스별 스타일을 받는다. 그래서 클래스가 있어야 앱에서도 모양이 산다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = path.join(__dirname, '..', 'data', 'ali-products.json');

const MAX_ITEMS = 8;      // 기사당 노출 상품 수 (본문이 너무 무거워지지 않게)
const ROTATE_BY_ID = true; // 글마다 다른 상품이 보이도록 시작 위치를 돌린다

let _cache = null;
function loadProducts() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  } catch {
    _cache = [];
  }
  return _cache;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// "VND 823575" → "823,575₫"
function fmtPrice(v) {
  const n = String(v || '').replace(/[^\d]/g, '');
  return n ? Number(n).toLocaleString('en-US') + '₫' : esc(v);
}

/**
 * 기사 하단 제휴 상품 블록 HTML. 상품 데이터가 없으면 '' (미표시).
 * @param {string} _category - (미사용, 하위호환) 기사 카테고리
 * @param {string} src - 성과추적용 위치 태그(예: 'news','archive')
 * @param {number|string} seed - 글 id 등. 글마다 다른 상품을 보여주기 위한 회전 씨앗
 */
export function buildAffiliateBlockHtml(_category, src = 'news', seed = 0) {
  const all = loadProducts();
  if (!all.length) return '';

  // 글마다 시작 지점을 달리해 같은 상품만 반복 노출되지 않게 한다
  let items;
  if (ROTATE_BY_ID && all.length > MAX_ITEMS) {
    const n = Math.abs(parseInt(seed, 10) || 0) % all.length;
    items = all.slice(n).concat(all.slice(0, n)).slice(0, MAX_ITEMS);
  } else {
    items = all.slice(0, MAX_ITEMS);
  }

  const cards = items.map((p) => {
    const title = esc(p.title).slice(0, 45);
    const url = esc(p.url) + (src ? (p.url.includes('?') ? '&' : '?') + 'aff_src=' + encodeURIComponent(src) : '');
    return `<a class="chaovn-aff-card" href="${url}" target="_blank" rel="nofollow sponsored noopener" style="flex:0 0 140px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff;text-decoration:none;color:#334155"><img class="chaovn-aff-img" src="${esc(p.image)}" alt="${title}" loading="lazy" style="width:140px;height:140px;object-fit:cover;display:block"><span class="chaovn-aff-body" style="display:block;padding:6px"><span class="chaovn-aff-name" style="display:block;font-size:11px;line-height:1.3;height:29px;overflow:hidden">${title}</span><span class="chaovn-aff-price" style="display:block;font-size:13px;font-weight:800;color:#e62e04;margin-top:3px">${fmtPrice(p.price)}</span><span class="chaovn-aff-orig" style="display:block;font-size:10px;color:#9ca3af"><s>${fmtPrice(p.origPrice)}</s> <b style="color:#e62e04">-${esc(p.discount)}</b></span></span></a>`;
  }).join('');

  return `
<div class="chaovn-aff" style="margin:30px 0 8px">
  <div class="chaovn-aff-title" style="font-size:15px;font-weight:700;color:#c2410c;margin-bottom:8px">🛍️ 알리익스프레스 인기 상품 <span class="chaovn-aff-sub" style="font-size:11px;font-weight:400;color:#9ca3af">· 베트남 직배송 특가</span></div>
  <div class="chaovn-aff-row" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px">${cards}</div>
  <div class="chaovn-aff-note" style="font-size:11px;color:#b3b3b3;margin-top:6px;text-align:center">* 제휴 링크입니다. 클릭·구매 시 씬짜오의 운영에 도움을 주시게 됩니다. (구매 가격은 동일합니다.)</div>
</div>`.trim();
}
