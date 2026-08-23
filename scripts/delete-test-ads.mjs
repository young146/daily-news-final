// 통합 광고센터에서 '테스트로 등록한 광고'를 지운다.
//
// 왜 지우나 (2026-08-24 사장님 지시): 광고 표시를 통합센터 하나로 모으기로 했다.
//   테스트로 만들어 둔 것들이 섞여 있으면 ① 목록이 지저분해 진짜 광고를 놓치고
//   ② 누가 기간만 되살리면 "테스트"라는 제목이 사이트에 걸린다.
//
// 왜 이것들이 '잘못된 페이지 값'을 갖고 있나:
//   예전 등록 화면은 지면별로 페이지 목록을 걸러 주지 않았다. 그래서 vnkorlife 광고에
//   `news-terminal`(= chaovietnam 지면의 페이지)이 저장되는 식의 조합이 만들어졌다.
//   그런 값은 어느 화면에도 안 맞아서 그 광고는 아무 데도 안 뜬다.
//   지금은 콘솔의 PAGE_SLOTS 가 그런 조합을 아예 못 고르게 막는다.
//
// 판정 기준: 제목 또는 광고주명에 테스트/데스트/TEST 가 들어간 것.
//   ⚠️ 진짜 광고주 이름에 그런 낱말이 들어갈 일은 없지만, --apply 전에
//      목록을 눈으로 확인하도록 기본은 미리보기다.
//
// 안전장치: 지우기 전 원본 전체를 .tmp/ 에 저장한다(복구 가능).
//
// 실행: node scripts/delete-test-ads.mjs          (미리보기)
//       node scripts/delete-test-ads.mjs --apply  (실제 삭제)
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
const { getFirestore } = await import("../lib/firebase-admin.js");

const APPLY = process.argv.includes("--apply");
const db = getFirestore();

const KEYWORDS = ["테스트", "데스트", "TEST", "Test", "test"];
const looksTest = (s) => KEYWORDS.some((k) => String(s || "").includes(k));

const snap = await db.collection("ads_unified").get();

const targets = [];
for (const doc of snap.docs) {
  const a = doc.data();
  // 제목·광고주명만 본다. 이미지 URL 등에 우연히 'test' 가 들어가는 것까지 잡으면 위험하다.
  if (looksTest(a.title) || looksTest(a.advertiserName) || looksTest(a.advertiserId)) {
    targets.push({ id: doc.id, data: a });
  }
}

console.log(`전체 ${snap.size}건 중 테스트로 보이는 광고 ${targets.length}건\n`);
for (const { id, data: a } of targets) {
  console.log(`  🗑 ${a.title || "(제목없음)"}  [광고주: ${a.advertiserName || "-"}]`);
  console.log(`     기간 ${a.startDate}~${a.endDate}  지면 ${(a.surfaces || []).join(",")}`);
  for (const [s, pl] of Object.entries(a.placements || {})) {
    const pages = pl?.targetPages || [];
    console.log(`       · ${s}: 위치=${pl?.position || "-"} 페이지=${pages.length ? pages.join(",") : "전체"}`);
  }
  console.log(`     id=${id}`);
}

if (!targets.length) {
  console.log("지울 것이 없습니다.");
  process.exit(0);
}

if (!APPLY) {
  console.log("\n미리보기입니다. 실제로 지우려면 --apply 를 붙이세요.");
  process.exit(0);
}

// 지우기 전 전체 백업 (지운 것만이 아니라 컬렉션 전체 — 되돌릴 때 맥락이 필요하다)
const dir = path.join(process.cwd(), ".tmp");
fs.mkdirSync(dir, { recursive: true });
const backup = path.join(dir, `ads-unified-backup-${Date.now()}.json`);
fs.writeFileSync(
  backup,
  JSON.stringify(snap.docs.map((d) => ({ id: d.id, data: d.data() })), null, 1),
  "utf8",
);
console.log(`\n전체 백업: ${backup}`);

for (const { id, data } of targets) {
  await db.collection("ads_unified").doc(id).delete();
  console.log(`  ✅ 삭제: ${data.title || id}`);
}
console.log(`\n${targets.length}건 삭제 완료. 남은 광고 ${snap.size - targets.length}건.`);
