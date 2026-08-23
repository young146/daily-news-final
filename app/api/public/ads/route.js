// app/api/public/ads/route.js
// 공개 광고 API — 워드프레스(chaovietnam.co.kr) 등 Firestore 를 직접 못 읽는 지면용.
// 통합센터(ads_unified)에서 chaovietnam 지면 활성 광고를 JSON 으로 내보낸다.
//
// 사용: GET /api/public/ads?page=home|news-terminal|detail   (page 생략 = 전체)
//   page=news-terminal 은 독립 지면 "news-terminal" 광고를 내준다(구 chaovietnam 타겟팅도 호환).
// ads_unified 는 공개 읽기(rules read:true)라 client SDK 로 읽는다(서비스계정 불필요).
// 상세 설계: PROGRESS_UNIFIED_ADS.md

import { NextResponse } from "next/server";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getClientFirestore } from "@/lib/firebase-client";

export const dynamic = "force-dynamic";

// 광고는 공개 콘텐츠 → CORS 전면 허용(워드프레스 브라우저 JS 가 직접 호출).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // 1분 CDN 캐시(광고는 실시간성이 낮음, 서버 부하↓)
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page"); // home | news-terminal | detail (선택)
  const today = new Date().toISOString().slice(0, 10);

  try {
    const db = getClientFirestore();
    // 뉴스 터미널은 2026-08-23 부터 **독립 지면**이다(chaovietnam 의 페이지가 아니다).
    // 두 지면을 한 번에 읽고, 어느 배치를 쓸지는 아래에서 페이지별로 고른다.
    const snap = await getDocs(
      query(collection(db, "ads_unified"), where("surfaces", "array-contains-any", ["chaovietnam", "news-terminal"])),
    );

    const wantTerminal = page === "news-terminal";

    // 이 광고가 지금 요청한 페이지에 쓸 배치(placement)를 고른다. 해당 없으면 null.
    const pick = (a) => {
      const sf = a.surfaces || [];
      if (wantTerminal) {
        // 새 방식: 뉴스터미널 지면으로 등록된 광고
        if (sf.includes("news-terminal")) return a.placements?.["news-terminal"] || {};
        // 구 데이터 호환: chaovietnam 지면 + 타겟페이지에 news-terminal 을 넣어 둔 광고
        const cvn = a.placements?.chaovietnam;
        if (sf.includes("chaovietnam") && (cvn?.targetPages || []).includes("news-terminal")) return cvn;
        return null;
      }
      if (!sf.includes("chaovietnam")) return null;   // 터미널 전용 광고는 다른 페이지에 안 나간다
      return a.placements?.chaovietnam || {};
    };

    const ads = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .map((a) => ({ a, pl: pick(a) }))
      .filter(({ a, pl }) => {
        if (!pl) return false;
        if (!a.isActive) return false;
        if ((a.startDate || "") > today || (a.endDate || "") < today) return false;
        // 페이지 버킷 타겟팅 (빈 배열 = 전체). page 미지정이면 필터 안 함.
        // 뉴스터미널은 화면이 하나뿐이라 페이지 타겟팅 자체가 없다.
        if (wantTerminal) return true;
        const tp = pl.targetPages || [];
        if (page && tp.length > 0 && !tp.includes(page)) return false;
        return true;
      })
      .sort((x, y) => (x.a.priority ?? 99) - (y.a.priority ?? 99))
      .map(({ a, pl }) => ({
        id: a.id,
        title: a.title || "",
        advertiserId: a.advertiserId || "",
        type: a.type || "image",
        imageUrl: (a.images || [])[0] || "",
        images: a.images || [],
        linkUrl: a.linkUrl || "",
        priority: a.priority ?? 99,
        // 위치: header/top/in-content/section/bottom/sidebar. 구 문서 호환(slot) + 기본 in-content.
        slot: pl.position || pl.slot || "in-content",
      }));

    return NextResponse.json({ ads, count: ads.length }, { headers: CORS });
  } catch (e) {
    // 실패해도 워드프레스가 깨지지 않도록 빈 목록 + 200
    console.error("[/api/public/ads] error:", e?.message || e);
    return NextResponse.json({ ads: [], count: 0, error: "failed" }, { status: 200, headers: CORS });
  }
}
