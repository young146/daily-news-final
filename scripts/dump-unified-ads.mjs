// 통합 광고센터(ads_unified)에 등록된 광고를 지면·위치·타겟페이지까지 그대로 찍는다.
//
// 왜 필요한가: "슬롯은 있는데 왜 광고가 안 뜨지?" 를 화면만 보고는 알 수 없다.
//   슬롯이 비는 이유는 셋 중 하나다 — ① 그 위치에 광고가 없다 ② 그 페이지가
//   타겟에서 빠졌다 ③ 기간이 지났다. 등록 데이터를 봐야 어느 쪽인지 갈린다.
//
// 읽기 전용. ads_unified 는 공개 읽기라 서비스계정이 필요 없다.
//   실행: node scripts/dump-unified-ads.mjs
import { collection, getDocs } from "firebase/firestore";
import { getClientFirestore } from "../lib/firebase-client.js";

const today = new Date().toISOString().slice(0, 10);

const db = getClientFirestore();
const snap = await getDocs(collection(db, "ads_unified"));

console.log(`등록된 광고 ${snap.size}건 (오늘 ${today})\n`);

for (const d of snap.docs) {
  const a = d.data();
  const live =
    a.isActive && (a.startDate || "") <= today && (a.endDate || "") >= today;
  console.log(`${live ? "🟢 노출중" : "⚪ 미노출"}  ${a.title || "(제목없음)"}`);
  console.log(`   광고주 : ${a.advertiserName || a.advertiserId || "-"}`);
  console.log(`   기간   : ${a.startDate} ~ ${a.endDate}   활성=${a.isActive}   우선순위=${a.priority ?? "-"}`);
  console.log(`   지면   : ${(a.surfaces || []).join(", ") || "(없음)"}`);
  for (const [surface, pl] of Object.entries(a.placements || {})) {
    const pages = pl?.targetPages || [];
    console.log(
      `     · ${surface.padEnd(14)} 위치=${String(pl?.position || pl?.slot || "-").padEnd(12)}` +
        ` 페이지=${pages.length ? pages.join(",") : "전체"}`,
    );
  }
  console.log();
}
