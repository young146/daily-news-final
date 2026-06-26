// 디렉토리 관리자 수정 저장 — 관리자 토큰 검증 → DirectoryEdit 저장 → SearchIndex 즉시 반영.
// POST /api/directory/edit   body: { id, overrides, extra }   header: Authorization: Bearer <Firebase ID 토큰>
import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma.js";
import { getFirebaseAuth } from "../../../../lib/firebase-admin.js";
import { applyEditToIndex } from "../../../../lib/apply-directory-edits.js";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["info@chaovietnam.co.kr", "younghan146@gmail.com"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  try {
    // 1) 관리자 인증 (Firebase ID 토큰)
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "no_token" }, { status: 401, headers: CORS });

    let email = "";
    try {
      const decoded = await getFirebaseAuth().verifyIdToken(token);
      email = decoded.email || "";
    } catch {
      return NextResponse.json({ error: "invalid_token" }, { status: 401, headers: CORS });
    }
    if (!ADMIN_EMAILS.includes(email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: CORS });
    }

    // 2) 본문
    const body = await request.json();
    const id = (body.id || "").trim();
    const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : {};
    const extra = typeof body.extra === "string" ? body.extra : null;
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400, headers: CORS });

    // 3) 저장(보존) + 색인 즉시 반영
    await prisma.directoryEdit.upsert({
      where: { id },
      create: { id, overrides, extra, updatedBy: email },
      update: { overrides, extra, updatedBy: email },
    });
    const applied = await applyEditToIndex(prisma, id, overrides);

    return NextResponse.json({ ok: true, applied }, { headers: CORS });
  } catch (e) {
    console.error("[/api/directory/edit] error:", e);
    return NextResponse.json({ error: "failed", message: e.message }, { status: 500, headers: CORS });
  }
}
