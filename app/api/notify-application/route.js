// 옐로페이지 상단노출 신청 → 관리자 이메일 알림 (SendGrid 재사용)
// POST /api/notify-application  body: { name, category, city, district, address, phone, userEmail }
import { NextResponse } from "next/server";
import { sendNewsletterWithFallback } from "../../../lib/email-service.js";

export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["info@chaovietnam.co.kr", "younghan146@gmail.com"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const esc = (s) => String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  try {
    const b = await request.json();
    const name = String(b.name || "").trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "missing_name" }, { status: 400, headers: CORS });

    const rows = [
      ["업소명", name],
      ["카테고리", b.category],
      ["지역", [b.city, b.district].filter(Boolean).join(" ")],
      ["주소", b.address],
      ["전화", b.phone],
      ["신청자", b.userEmail],
    ].filter(([, v]) => v);

    const html = `
      <div style="font-family:sans-serif;max-width:560px">
        <h2 style="color:#c04a00">⭐ 옐로페이지 상단 노출 신청</h2>
        <p>새 신청이 접수되었습니다. 확인 후 요금 안내·승인을 진행하세요.</p>
        <table style="border-collapse:collapse;width:100%">
          ${rows.map(([k, v]) => `<tr><td style="padding:6px 10px;background:#f5f5f5;font-weight:bold;width:90px">${esc(k)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(v)}</td></tr>`).join("")}
        </table>
        <p style="margin-top:16px">
          <a href="https://www.vnkorlife.com/admin" style="background:#c04a00;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">관리자 패널에서 승인하기</a>
        </p>
        <p style="color:#888;font-size:12px">이웃사업 관리 탭에서 "✅ 승인"을 누르면 게재됩니다.</p>
      </div>`;

    await sendNewsletterWithFallback(ADMIN_EMAILS, `[옐로페이지 신청] ${name}`, html);
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (e) {
    console.error("[/api/notify-application] error:", e);
    return NextResponse.json({ error: "failed", message: e.message }, { status: 500, headers: CORS });
  }
}
