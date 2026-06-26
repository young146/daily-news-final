// 디렉토리 단건 조회 — 내부 상세페이지(/biz/[id])용.
// GET /api/search/item?id=yellow:abc | company:123
//  - 공통: 색인 레코드(도시·구군 한글, 좌표 등)
//  - 진출기업: 원본 xcd/v1 에서 전체 항목(대표자·업종·사업내용·제품·고용인원·이메일 등) 보강
import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma.js";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const XCD = `${process.env.WORDPRESS_URL || "https://chaovietnam.co.kr"}/wp-json/xcd/v1`;
const v = (x) => (x === null || x === undefined || String(x).trim() === "" ? null : x);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  const id = (request.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400, headers: CORS });
  try {
    const idx = await prisma.searchIndex.findUnique({
      where: { id },
      select: {
        id: true, type: true, title: true, summary: true, url: true, phone: true,
        address: true, imageUrl: true, city: true, district: true, category: true, lat: true, lng: true,
      },
    });
    if (!idx) return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });

    let item = { ...idx };

    // 진출기업: 원본에서 전체 항목 보강
    if (idx.type === "company") {
      const nativeId = id.split(":")[1];
      try {
        const res = await fetch(`${XCD}/${nativeId}`, { headers: { Accept: "application/json" } });
        if (res.ok) {
          const j = await res.json();
          const c = j.item || j;
          item = {
            ...item,
            address: v(c.address) || item.address,
            director: v(c.director),
            industryGroup: v(c.industry_group),
            industryDetail: v(c.industry_detail),
            description: v(c.description),
            products: v(c.products),
            employees: v(c.employees),
            tel: v(c.tel),
            mobile: v(c.mobile),
            email: v(c.email),
            additionalEmails: v(c.additional_emails),
            homepage: v(c.homepage),
            foundedYear: v(c.founded_year),
            country: v(c.country),
          };
        }
      } catch {
        /* 원본 실패 시 색인 정보만으로 표시 */
      }
    }

    // 관리자 수정/기타 병합 (있으면 우선)
    try {
      const edit = await prisma.directoryEdit.findUnique({ where: { id } });
      if (edit) {
        item = { ...item, ...(edit.overrides || {}), extra: edit.extra ?? null };
      }
    } catch {
      /* DirectoryEdit 없거나 조회 실패 시 기본 정보만 */
    }

    return NextResponse.json({ item }, { headers: CORS });
  } catch (e) {
    console.error("[/api/search/item] error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500, headers: CORS });
  }
}
