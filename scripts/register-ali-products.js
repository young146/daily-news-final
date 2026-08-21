// ════════════════════════════════════════════════════════════════
// 알리익스프레스 제휴 상품 → 통합 광고센터(ads_unified) 등록
// ────────────────────────────────────────────────────────────────
// 왜: 회사 표준은 "통합 광고센터 한 곳 등록 → 공개 API → 웹(chaovietnam·vnkorlife)·앱이
//     각자 슬롯에 자동 노출". 제휴 상품도 광고와 같은 경로로 나가야 한 곳에서 관리된다.
//     (본문 HTML 에 박아 넣는 방식은 2026-08-21 폐기)
//
// 무엇: data/ali-products.json (Portals Ad Center Export) → ads_unified 문서로 등록.
//   · advertiserId: 'aliexpress-affiliate' 로 묶어 나중에 일괄 교체/삭제 가능
//   · surfaces: chaovietnam / vnkorlife / app  → 세 지면 동시 노출
//   · slot(위치): in-content (기사 중간). priority 로 노출 순서.
//   · 기존 등록분은 먼저 지우고 새로 넣는다(상품 갱신 = 이 스크립트 재실행).
//
// 실행: DRY=1 node scripts/register-ali-products.js   (미리보기)
//       LIMIT=8 node scripts/register-ali-products.js (8개만)
//       node scripts/register-ali-products.js         (기본 8개)
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DRY = process.env.DRY === '1';
const LIMIT = parseInt(process.env.LIMIT || '8', 10);
const ADVERTISER = 'aliexpress-affiliate';

if (!admin.apps.length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

function today() { return new Date().toISOString().slice(0, 10); }
function plusYears(n) { const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); }

async function main() {
  const file = path.join(__dirname, '..', 'data', 'ali-products.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = all.slice(0, LIMIT);
  console.log(`[ali-ads] 상품 ${all.length}개 중 ${items.length}개 등록${DRY ? ' (DRY-RUN)' : ''}`);

  // 기존 알리 상품 광고 정리(중복 방지)
  const old = await db.collection('ads_unified').where('advertiserId', '==', ADVERTISER).get();
  console.log(`[ali-ads] 기존 등록분 ${old.size}개 ${DRY ? '삭제 예정' : '삭제'}`);
  if (!DRY) {
    const batch = db.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    if (old.size) await batch.commit();
  }

  let n = 0;
  for (const p of items) {
    const price = String(p.price || '').replace(/[^\d]/g, '');
    const title = `${p.title.slice(0, 40)} ${price ? Number(price).toLocaleString() + '₫' : ''}${p.discount ? ' (-' + p.discount + ')' : ''}`.trim();
    const doc = {
      title,
      advertiserId: ADVERTISER,
      advertiserName: '알리익스프레스(제휴)',
      type: 'image',
      images: [p.image],
      linkUrl: p.url,
      isActive: true,
      startDate: today(),
      endDate: plusYears(3),
      priority: 50 + n,                 // 자체 광고(우선순위 낮은 숫자)보다 뒤
      surfaces: ['chaovietnam', 'vnkorlife', 'app'],
      placements: {
        chaovietnam: { position: 'in-content', targetPages: [] },
        vnkorlife:   { position: 'in-content', targetPages: [] },
        app:         { position: 'in-content', targetPages: [] },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (DRY) {
      if (n < 3) console.log(`  [DRY] ${title}`);
    } else {
      await db.collection('ads_unified').add(doc);
    }
    n++;
  }
  console.log(`[ali-ads] 완료 — ${n}개 ${DRY ? '등록 예정' : '등록됨'}`);
  process.exit(0);
}
main().catch((e) => { console.error('[ali-ads] 오류:', e.message); process.exit(1); });
