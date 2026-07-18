// 색인 ID 목록 — sitemap 생성 전용 경량 엔드포인트.
// GET /api/search/ids?type=yellow  →  { total, items: [{ id, updatedAt }] }
//
// 왜 필요한가: /api/search 는 pageSize 가 20 으로 고정이라 옐로 3,700여 건을
// 열거하려면 188 번 호출해야 한다. sitemap 은 한 번에 전부 필요하므로,
// 본문(제목·주소 등) 없이 id + updatedAt 만 내려주는 경로를 따로 둔다.
// 응답이 가벼워(건당 ~60B) 전량을 한 번에 안전하게 반환할 수 있다.
import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma.js";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const ALLOWED_TYPES = ["yellow", "company", "news", "magazine"];
const MAX = 50000; // sitemap 규격상 파일당 상한

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

  try {
    const items = await prisma.searchIndex.findMany({
      where: { type },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: MAX,
    });

    return NextResponse.json(
      { total: items.length, items },
      {
        headers: {
          ...CORS,
          // sitemap 은 자주 바뀌지 않으므로 CDN 에서 1시간 캐시
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    console.error("[search/ids] failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: CORS });
  }
}
