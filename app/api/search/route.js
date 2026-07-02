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

// ============================================================
// 카테고리 동의어 — "사람이 쓰는 말" → "옐로페이지의 실제 카테고리 슬러그"
// 자유검색은 searchText(상호·요약)만 훑고 category 는 안 훑는다. 그래서 상호에
// 그 단어가 안 들어간 업소는 누락됐다(예: "미용실"로 검색해도 상호가 "○○Hair"면 못 찾음).
// 아래 맵으로 흔한 검색어를 옐로 카테고리 슬러그에 연결해 category 도 함께 OR 매칭한다.
//
// ⚠️ 옐로(type=yellow)만 매핑한다. 진출기업(company) 카테고리는 "의료·제약",
//    "금융·보험" 같은 산업 대분류라, 소비자 서비스 검색어(치과·환전 등)에 매핑하면
//    엉뚱한 대기업(제약사·생명보험사)이 딸려와 정확도를 떨어뜨린다. 진출기업은
//    산업별 카테고리 필터(facet)로 찾는 게 맞다.
// ⚠️ 값은 반드시 DB에 실재하는 옐로 슬러그여야 함(카테고리 조사로 확인된 값만).
//    실재 슬러그: food, cafe, beauty, health, education, school, travel, lodging,
//    shopping, manufacturing, logistics, distribution, legal, finance,
//    construction, realestate, service, design, it, other
const CAT_SYNONYMS = {
  // 음식·카페
  "맛집": ["food"], "식당": ["food"], "음식점": ["food"], "밥집": ["food"], "레스토랑": ["food"], "한식": ["food"],
  "카페": ["cafe"], "커피": ["cafe"],
  // 미용
  "미용": ["beauty"], "미용실": ["beauty"], "헤어": ["beauty"], "네일": ["beauty"], "피부": ["beauty"], "이발": ["beauty"],
  // 의료 — 일반어만 health 통으로 매핑. 세부 진료과(치과·한의원·약국)는 상호 텍스트가
  //        더 정확하므로 제외(안 그러면 "치과"에 안과·산부인과가 딸려옴).
  "병원": ["health"], "의원": ["health"], "의료": ["health"], "클리닉": ["health"],
  // 교육
  "학원": ["education", "school"], "학교": ["education", "school"], "교육": ["education", "school"], "과외": ["education"], "유치원": ["education", "school"],
  // 여행·숙박
  "여행": ["travel"], "여행사": ["travel"], "관광": ["travel"], "투어": ["travel"],
  "숙박": ["lodging"], "호텔": ["lodging"], "게스트하우스": ["lodging"], "숙소": ["lodging"],
  // 쇼핑
  "쇼핑": ["shopping"], "마트": ["shopping"], "상점": ["shopping"], "매장": ["shopping"], "가게": ["shopping"],
  // 물류·유통·제조
  "물류": ["logistics"], "운송": ["logistics"], "택배": ["logistics"], "이사": ["logistics"],
  "유통": ["distribution"], "무역": ["distribution"], "도매": ["distribution"],
  "제조": ["manufacturing"], "공장": ["manufacturing"],
  // 법무·금융
  "법무": ["legal"], "변호사": ["legal"], "행정사": ["legal"], "비자": ["legal"], "세무": ["legal"], "회계": ["legal"], "노무": ["legal"],
  "금융": ["finance"], "은행": ["finance"], "보험": ["finance"], "환전": ["finance"], "송금": ["finance"],
  // 건설·부동산
  "건설": ["construction"], "시공": ["construction"], "인테리어": ["construction", "design"], "공사": ["construction"], "자재": ["construction"],
  "부동산": ["realestate"], "임대": ["realestate"], "월세": ["realestate"], "아파트": ["realestate"], "주택": ["realestate"],
  // 디자인·IT — 수리/세탁/청소는 잡동사니 통(service)이라 매핑 안 함(상호 텍스트로만 매칭).
  "디자인": ["design"], "인쇄": ["design"], "광고": ["design"], "간판": ["design"],
  "컴퓨터": ["it"], "소프트웨어": ["it"],
};

// q 안에 카테고리 동의어 키가 들어 있으면, 옐로 카테고리 슬러그들을 모아 반환.
function expandCategories(q) {
  const yellow = new Set();
  for (const [key, slugs] of Object.entries(CAT_SYNONYMS)) {
    if (q.includes(key)) for (const s of slugs) yellow.add(s);
  }
  return [...yellow];
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
      // 카테고리 동의어: 흔한 검색어를 옐로 카테고리 슬러그에 연결해 category 도 함께 매칭.
      const catSlugs = expandCategories(q);
      if (catSlugs.length)
        ors.push(Prisma.sql`(type = 'yellow' AND category IN (${Prisma.join(catSlugs)}))`);
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
