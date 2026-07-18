// 조합별 건수(패싯) — 지역×카테고리 목록 페이지 생성용.
// GET /api/search/facets?type=yellow&min=10
//   → { type, min, combos: [{ city, district, category, n }] }
//
// 왜 필요한가: vnkorlife-web 의 /yellowpage/[도시]/[카테고리] 페이지를 만들려면
// "어떤 조합에 업소가 몇 곳 있나"를 알아야 하는데, /api/search 로는 조합마다
// 한 번씩(300여 회) 물어야 한다. GROUP BY 한 방으로 대신한다.
//
// district 가 null 인 행도 그대로 담는다 → 받는 쪽에서 도시 단위 합계를 낼 수 있다.
import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma.js";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const ALLOWED_TYPES = ["yellow", "company", "news", "magazine"];
const DEFAULT_MIN = 1;
const MAX_MIN = 1000;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const type = (request.nextUrl.searchParams.get("type") || "").trim();
  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "invalid_type", allowed: ALLOWED_TYPES },
      { status: 400, headers: CORS }
    );
  }

  // min 은 정수로 강제 — 쿼리에 문자열 보간되므로 반드시 검증한다
  const rawMin = parseInt(request.nextUrl.searchParams.get("min") || "", 10);
  const min = Number.isFinite(rawMin) ? Math.min(Math.max(rawMin, 1), MAX_MIN) : DEFAULT_MIN;

  try {
    const combos = await prisma.$queryRaw`
      SELECT city, district, category, count(*)::int AS n
      FROM "SearchIndex"
      WHERE type = ${type}
        AND city IS NOT NULL
        AND category IS NOT NULL
      GROUP BY city, district, category
      HAVING count(*) >= ${min}
      ORDER BY n DESC
    `;

    return NextResponse.json(
      { type, min, combos },
      {
        headers: {
          ...CORS,
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    console.error("[search/facets] failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: CORS });
  }
}
