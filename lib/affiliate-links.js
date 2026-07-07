// ── 제휴 링크 레지스트리 ──────────────────────────────────────────
// /go/<slug> 리다이렉트(app/go/[slug]/route.js)가 여기서 목적지를 찾는다.
//
// 왜 한 겹 감싸나(우리 /go/ → invl.me → 제휴사):
//   - 사이트·이메일엔 항상 chaovietnam 링크(/go/aliexpress)만 노출 → 제휴사·딥링크가
//     바뀌어도 콘텐츠의 링크는 그대로. 교체·측정을 우리가 통제.
//   - 제휴사 추가 = 여기에 slug 한 줄. Shopee/Lazada 베트남도 승인되면 여기 추가만 하면 됨.
//
// deeplink = Involve Asia 딥링크(invl.me/…) 또는 제휴사 추적 URL.
//   Involve에서 "Create Deeplink"로 제휴사 홈/카테고리 URL을 넣어 생성 → invl.me 복사.
export const AFFILIATE_LINKS = {
  aliexpress: {
    name: 'AliExpress',
    label: '알리익스프레스 · 중국 직구',
    deeplink: 'https://invl.me/clnm8nk', // 검증됨: af=1089810 (2026-07-07)
  },

  // ↓ Approved — 딥링크 검증됨(2026-07-07, af/sharedid=1089810)
  taobao: {
    name: 'Taobao',
    label: '타오바오 · 중국 직구',
    deeplink: 'https://invl.me/clnm8si', // → intl.taobao.com
  },
  airalo: {
    name: 'Airalo',
    label: '에어알로 · 여행 eSIM',
    deeplink: 'https://invl.me/clnm8t3', // → airalo.com
  },
  udemy: {
    name: 'Udemy',
    label: '유데미 · 온라인 강의',
    deeplink: 'https://invl.me/clnm8u4', // → udemy.com
  },

  // ↓ 승인 대기(Pending) — 승인되면 딥링크 채우기
  // oliveyoung: { name:'Olive Young', label:'올리브영 · 한국 화장품', deeplink:'' },
  // traveloka:  { name:'Traveloka',  label:'트라블로카 · 베트남 여행 예약', deeplink:'' },
  // iherb:      { name:'iHerb',      label:'아이허브 · 건강식품', deeplink:'' },

  // ↓ 미래: 베트남 쇼핑몰 (Shopee 자체 / Lazada 승인 시 여기 추가)
  // shopee: { name:'Shopee VN', label:'쇼피 베트남', deeplink:'' },
  // lazada: { name:'Lazada VN', label:'라자다 베트남', deeplink:'' },
};

/** slug 로 유효한(딥링크 채워진) 제휴 항목 반환. 없거나 미완이면 null. */
export function getAffiliate(slug) {
  const e = AFFILIATE_LINKS[slug];
  return e && e.deeplink ? e : null;
}
