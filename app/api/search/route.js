// ============================================================
// 통합검색 API — 4소스(news/magazine/company/yellow) 단일 질의
// GET /api/search?q=비자&city=호치민&type=company&category=&page=1
// 한글 부분일치(ILIKE) + pg_trgm 유사도(오타 보정)로 검색·랭킹.
// 앱에서도 호출하므로 CORS 허용.
// ============================================================
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma.js";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const type = (sp.get("type") || "").trim();        // news|magazine|company|yellow
  const city = (sp.get("city") || "").trim();
  const district = (sp.get("district") || "").trim();
  const category = (sp.get("category") || "").trim();
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // browse 모드: 검색어 없이 필터(type/도시/구군/카테고리)만으로 목록.
  // 검색어도 필터도 없으면 전체 나열 방지 위해 빈 결과.
  const browse = q.length < 1;
  if (browse && !type && !city && !district && !category) {
    return NextResponse.json(
      { results: [], facets: { type: {} }, total: 0, page },
      { headers: CORS }
    );
  }

  try {
    // q 외 공통 필터 (패싯 계산용 — type 제외)
    const base = [];
    if (!browse) {
      base.push(Prisma.sql`("searchText" ILIKE ${"%" + q + "%"} OR similarity("searchText", ${q}) > 0.1)`);
    }
    if (city) base.push(Prisma.sql`city = ${city}`);
    if (district) base.push(Prisma.sql`district = ${district}`);
    if (category) base.push(Prisma.sql`category = ${category}`);
    // 조건이 하나도 없으면(browse+type만) WHERE 가 비지 않게 TRUE 사용 (join([]) 빈배열 에러 방지)
    const whereOf = (arr) => (arr.length ? Prisma.join(arr, " AND ") : Prisma.sql`TRUE`);
    const baseWhere = whereOf(base);

    // 결과용 — type 필터 추가
    const full = [...base];
    if (type) full.push(Prisma.sql`type = ${type}`);
    const fullWhere = whereOf(full);

    // 정렬: 검색은 관련도순, browse 는 우선순위→이름순
    const orderBy = browse
      ? Prisma.sql`priority DESC, title ASC`
      : Prisma.sql`priority DESC, similarity("searchText", ${q}) DESC, "publishedAt" DESC NULLS LAST`;
    const simSelect = browse ? Prisma.sql`0 AS sim` : Prisma.sql`similarity("searchText", ${q}) AS sim`;

    const [results, totalRows, facetRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, type, title, summary, url, phone, address, "imageUrl", city, district, category, lat, lng, priority,
               "publishedAt", ${simSelect}
        FROM "SearchIndex"
        WHERE ${fullWhere}
        ORDER BY ${orderBy}
        LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      prisma.$queryRaw`SELECT count(*)::int AS n FROM "SearchIndex" WHERE ${fullWhere}`,
      prisma.$queryRaw`SELECT type, count(*)::int AS n FROM "SearchIndex" WHERE ${baseWhere} GROUP BY type`,
    ]);

    const facets = { type: {} };
    for (const r of facetRows) facets.type[r.type] = r.n;
    const total = (totalRows[0] && totalRows[0].n) || 0;

    return NextResponse.json(
      {
        results: results.map((r) => ({
          id: r.id,
          type: r.type,
          title: r.title,
          summary: r.summary,
          url: r.url,
          phone: r.phone,
          address: r.address,
          imageUrl: r.imageUrl,
          city: r.city,
          district: r.district,
          category: r.category,
          lat: r.lat,
          lng: r.lng,
        })),
        facets,
        total,
        page,
        pageSize: PAGE_SIZE,
      },
      { headers: CORS }
    );
  } catch (e) {
    console.error("[/api/search] error:", e);
    return NextResponse.json(
      { error: "search_failed", message: e.message },
      { status: 500, headers: CORS }
    );
  }
}
