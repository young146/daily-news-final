// vnkorlife 지면 광고의 '위치'와 '노출 페이지'를 정리한다.
//
// 왜 필요한가 (2026-08-23 실측):
//   ① 노출 페이지에 vnkorlife 에 없는 값이 섞여 있다 — `news-terminal` 은 chaovietnam
//      지면의 페이지고, `detail` 은 옛 값이다. 예전 등록 화면이 지면별로 안 걸러서 생겼다.
//   ② 새로 만든 페이지(옐로페이지·블로그·업소상세)가 어느 광고 타겟에도 없어 새 자리가 빈다.
//   ③ 사장님 지시: "기존 광고는 가능하면 위쪽으로 올려라."
//
// 무엇을 하나:
//   · 위치를 한 단계 위로 (in-content → top, top → header). 단 bottom 하나는 남긴다 —
//     전부 올리면 모든 페이지의 하단 칸이 통째로 빈다.
//   · 노출 페이지를 '전체'(빈 배열)로 — 없는 페이지 값을 지우면서 새 페이지까지 한 번에 덮는다.
//   · chaovietnam·app 지면 배치는 건드리지 않는다. 이 스크립트는 vnkorlife 만 손댄다.
//
// 안전장치:
//   · --apply 를 붙이지 않으면 바꿀 내용만 보여주고 아무것도 쓰지 않는다(기본 = 미리보기)
//   · 바꾸기 전 원본을 .tmp/vnkorlife-ads-backup-<시각>.json 으로 저장한다
//
// 실행: node scripts/retune-vnkorlife-ads.mjs          (미리보기)
//       node scripts/retune-vnkorlife-ads.mjs --apply  (실제 반영)
import fs from "node:fs";
import path from "node:path";
// .env 를 손수 읽는다 — Next.js 밖에서 돌리면 자동으로 안 읽힌다.
// (FIREBASE_SERVICE_ACCOUNT_JSON 이 없으면 firebase-admin 이 기본 자격증명을 찾다가 죽는다)
import "dotenv/config";
const { getFirestore } = await import("../lib/firebase-admin.js");

const APPLY = process.argv.includes("--apply");
const db = getFirestore();
const today = new Date().toISOString().slice(0, 10);

// 위치를 한 단계 위로. header 가 꼭대기다.
const UP = { bottom: "in-content", "in-content": "top", top: "header", header: "header" };

// 이 광고만은 hbottom 에 남긴다 — 안 그러면 모든 페이지 하단 칸이 빈다.
// (판정 기준: 제휴 상품이고 '전체 페이지'로 깔려 있어 하단을 채우는 역할을 하고 있다)
const KEEP_AT_BOTTOM = (a, pl) => pl.position === "bottom" && (a.advertiserId || "").includes("ali");

const snap = await db
  .collection("ads_unified")
  .where("surfaces", "array-contains", "vnkorlife")
  .get();

const plan = [];
for (const doc of snap.docs) {
  const a = doc.data();
  const pl = a.placements?.vnkorlife;
  if (!pl) continue;

  const live = a.isActive && (a.startDate || "") <= today && (a.endDate || "") >= today;
  const from = pl.position || pl.slot || "";
  const pages = pl.targetPages || [];

  // ⚠️ 지금 노출 중인 광고만 손댄다.
  //   기간이 지난 테스트 광고까지 위로 올려두면, 나중에 누가 기간만 되살렸을 때
  //   "테스트"라는 제목이 사이트 맨 위 헤더에 걸린다. 그건 사고다.
  const keep = KEEP_AT_BOTTOM(a, pl);
  const to = !live || keep ? from : UP[from] || from;

  plan.push({
    id: doc.id,
    title: a.title || "(제목없음)",
    advertiser: a.advertiserName || a.advertiserId || "-",
    live,
    from,
    to,
    pagesFrom: pages,
    pagesTo: [], // 전체
    keep,
    changed: live && (to !== from || pages.length > 0),
  });
}

plan.sort((x, y) => Number(y.live) - Number(x.live));

console.log(`vnkorlife 지면 광고 ${plan.length}건 (오늘 ${today})\n`);
for (const p of plan) {
  const mark = p.changed ? "✏️" : "  ";
  console.log(`${mark} ${p.live ? "🟢" : "⚪"} ${p.title}  [${p.advertiser}]`);
  console.log(`      위치   : ${p.from}  →  ${p.to}${p.keep ? "   (하단 유지 — 모든 페이지 하단을 채우는 광고)" : ""}`);
  console.log(`      페이지 : ${p.pagesFrom.length ? p.pagesFrom.join(",") : "전체"}  →  전체`);
}

const todo = plan.filter((p) => p.changed);
console.log(`\n바꿀 것 ${todo.length}건 / 전체 ${plan.length}건`);

if (!APPLY) {
  console.log("\n미리보기입니다. 실제로 반영하려면 --apply 를 붙이세요.");
  process.exit(0);
}

// 원본 백업
const dir = path.join(process.cwd(), ".tmp");
fs.mkdirSync(dir, { recursive: true });
const backup = path.join(dir, `vnkorlife-ads-backup-${Date.now()}.json`);
fs.writeFileSync(
  backup,
  JSON.stringify(snap.docs.map((d) => ({ id: d.id, data: d.data() })), null, 1),
  "utf8",
);
console.log(`\n원본 백업: ${backup}`);

let n = 0;
for (const p of todo) {
  await db.collection("ads_unified").doc(p.id).update({
    "placements.vnkorlife.position": p.to,
    "placements.vnkorlife.targetPages": [],
  });
  n++;
  console.log(`  ✅ ${p.title}  ${p.from} → ${p.to}`);
}
console.log(`\n${n}건 반영 완료.`);
