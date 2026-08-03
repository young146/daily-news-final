// app/api/public/ads/route.js
// 공개 광고 API — 워드프레스(chaovietnam.co.kr) 등 Firestore 를 직접 못 읽는 지면용.
// 통합센터(ads_unified)에서 chaovietnam 지면 활성 광고를 JSON 으로 내보낸다.
//
// 사용: GET /api/public/ads?page=home|news-terminal|detail   (page 생략 = 전체)
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
    const snap = await getDocs(
      query(collection(db, "ads_unified"), where("surfaces", "array-contains", "chaovietnam")),
    );

    const ads = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => {
        if (!a.isActive) return false;
        if ((a.startDate || "") > today || (a.endDate || "") < today) return false;
        // 페이지 버킷 타겟팅 (빈 배열 = 전체). page 미지정이면 필터 안 함.
        const tp = a.placements?.chaovietnam?.targetPages || [];
        if (page && tp.length > 0 && !tp.includes(page)) return false;
        return true;
      })
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      .map((a) => {
        const cvn = a.placements?.chaovietnam || {};
        return {
          id: a.id,
          title: a.title || "",
          advertiserId: a.advertiserId || "",
          type: a.type || "image",
          imageUrl: (a.images || [])[0] || "",
          images: a.images || [],
          linkUrl: a.linkUrl || "",
          priority: a.priority ?? 99,
          // chaovietnam 위치: 상단/중간(in-content)/하단/사이드바. 구 문서 호환(slot) + 기본 in-content.
          slot: cvn.position || cvn.slot || "in-content",
        };
      });

    return NextResponse.json({ ads, count: ads.length }, { headers: CORS });
  } catch (e) {
    // 실패해도 워드프레스가 깨지지 않도록 빈 목록 + 200
    console.error("[/api/public/ads] error:", e?.message || e);
    return NextResponse.json({ ads: [], count: 0, error: "failed" }, { status: 200, headers: CORS });
  }
}
