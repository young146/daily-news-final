// 지역 필터 옵션 — 통합색인의 실제 도시/구군을 빈도순으로 반환.
// 색인 데이터에서 직접 뽑으므로 표기 불일치가 없고, 빈도 임계로 잡음을 거른다.
// GET /api/search/regions  → { cities:[{city,n}], districtsByCity:{ 호치민:[{district,n}], ... } }
import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma.js";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const CITY_MIN = 5;      // 도시 최소 건수(이하는 잡음)
const DISTRICT_MIN = 3;  // 구군 최소 건수

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  try {
    const cities = await prisma.$queryRawUnsafe(
      `SELECT city, count(*)::int AS n FROM "SearchIndex"
       WHERE city IS NOT NULL GROUP BY city HAVING count(*) >= ${CITY_MIN}
       ORDER BY n DESC`
    );
    const pairs = await prisma.$queryRawUnsafe(
      `SELECT city, district, count(*)::int AS n FROM "SearchIndex"
       WHERE city IS NOT NULL AND district IS NOT NULL
       GROUP BY city, district HAVING count(*) >= ${DISTRICT_MIN}
       ORDER BY n DESC`
    );
    const districtsByCity = {};
    for (const r of pairs) {
      (districtsByCity[r.city] = districtsByCity[r.city] || []).push({ district: r.district, n: r.n });
    }
    // 타입별 카테고리(옐로페이지 둘러보기 칩 등)
    const cats = await prisma.$queryRawUnsafe(
      `SELECT type, category, count(*)::int AS n FROM "SearchIndex"
       WHERE category IS NOT NULL GROUP BY type, category HAVING count(*) >= ${DISTRICT_MIN}
       ORDER BY n DESC`
    );
    const categoriesByType = {};
    for (const r of cats) {
      (categoriesByType[r.type] = categoriesByType[r.type] || []).push({ category: r.category, n: r.n });
    }
    return NextResponse.json({ cities, districtsByCity, categoriesByType }, { headers: CORS });
  } catch (e) {
    console.error("[/api/search/regions] error:", e);
    return NextResponse.json({ cities: [], districtsByCity: {} }, { status: 500, headers: CORS });
  }
}
