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

// ============================================================
// 동의어 사전 — "사람이 쓰는 말" → "데이터에 실제로 적힌 말"
// 옐로페이지·기사 데이터엔 "교민단체" 같은 단어가 없고, 대신 카테고리가
// "동문·동호회", "호치민 주요기관" 등으로 적혀 있다. 사용자가 기대하는
// 단어로 검색해도 해당 항목이 나오도록, 검색 시 아래 대체어들을 OR 로 함께 매칭.
// (정렬은 sort=category 가 옐로/진출기업을 기사보다 위에 두므로, 매칭만 되면 단체가 먼저 나온다.)
const SYNONYMS = {
  // 교민 커뮤니티/단체 — ("동문" 단독은 "자동문" 등에 오매칭되어 제외, 카테고리 "동문·동호회"는 "동호회"로 커버)
  "교민단체": ["동호회", "주요기관", "한인회", "여성회", "협회", "향우회", "동창회", "교민회", "상조회", "종교"],
  "교민회": ["한인회", "동호회", "주요기관", "협회"],
  "단체": ["동호회", "주요기관", "한인회", "협회", "향우회", "동창회"],
  "커뮤니티": ["동호회", "한인회", "협회", "주요기관"],
  "모임": ["동호회", "동창회", "향우회"],
  "한인회": ["한인회", "주요기관"],
  // 흔한 생활 검색어 ↔ 카테고리 표기
  "맛집": ["음식점", "식당", "식품"],
  "식당": ["음식점", "식품"],
  "병원": ["의료", "종합병원"],
  "약국": ["의료", "약국"],
  "학원": ["교육", "학원"],
  "학교": ["교육", "국제학교", "학교"],
  "숙소": ["호텔", "숙박"],
  "미용실": ["미용", "마사지"],
  "변호사": ["법무", "회계"],
  "은행": ["금융"],
};

// q 안에 사전 키가 들어 있으면 그 대체어들을 모아 반환(중복 제거, q 자체는 제외).
function expandQuery(q) {
  const out = new Set();
  for (const [key, terms] of Object.entries(SYNONYMS)) {
    if (q.includes(key)) for (const t of terms) if (t !== q) out.add(t);
  }
  return [...out];
}
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
      // 기본: 입력어 부분일치 + 오타보정(유사도). 추가: 동의어 대체어들도 부분일치로 OR.
      const ors = [
        Prisma.sql`"searchText" ILIKE ${"%" + q + "%"}`,
        Prisma.sql`similarity("searchText", ${q}) > 0.1`,
      ];
      for (const t of expandQuery(q)) ors.push(Prisma.sql`"searchText" ILIKE ${"%" + t + "%"}`);
      base.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
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

    // 정렬:
    //  - sort=category: 카테고리 순(옐로→진출기업→매거진→뉴스) + 그룹 내 우선순위(프리미엄)→최신순→가나다.
    //    앱·웹 통합검색 결과 화면이 이 값을 보냄.
    //    ⚠️ 그룹 내 정렬에 "publishedAt DESC" 추가: 매거진·뉴스가 가나다가 아니라 최신글 먼저 나오게.
    //       (옐로·진출기업은 publishedAt=null → NULLS LAST로 영향 없이 기존처럼 priority→title 유지)
    //  - browse: 우선순위→최신순→이름순
    //  - 그 외(검색): 관련도순
    const sort = (sp.get("sort") || "").trim();
    const orderBy =
      sort === "category"
        ? Prisma.sql`CASE type WHEN 'yellow' THEN 1 WHEN 'company' THEN 2 WHEN 'magazine' THEN 3 WHEN 'news' THEN 4 ELSE 5 END ASC, priority DESC, "publishedAt" DESC NULLS LAST, title ASC`
        : browse
        ? Prisma.sql`priority DESC, "publishedAt" DESC NULLS LAST, title ASC`
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
