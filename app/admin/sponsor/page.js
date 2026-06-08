"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getSponsorAction, saveSponsorAction } from "../actions";

const PUBLISHER_EN = "XinChao Daily News";
const PUBLISHER_TAGLINE = "24년 베트남 한인 미디어";

export default function SponsorAdminPage() {
  const [active, setActive] = useState(false);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");      // 저장돼 있는 로고 URL
  const [logoFile, setLogoFile] = useState(null);  // 새로 선택한 파일
  const [logoPreview, setLogoPreview] = useState(""); // 화면 미리보기용 URL
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await getSponsorAction();
      if (res?.success && res.sponsor) {
        setActive(res.sponsor.active);
        setName(res.sponsor.name || "");
        setLogoUrl(res.sponsor.logoUrl || "");
        setLogoPreview(res.sponsor.logoUrl || "");
      }
      setLoading(false);
    })();
  }, []);

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setMsg({ type: "err", text: "로고 파일이 2MB를 넘습니다. 더 작은 파일을 올려주세요." });
      e.target.value = "";
      return;
    }
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
    setMsg(null);
  };

  const onSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("active", active ? "true" : "false");
      fd.set("name", name);
      fd.set("logoUrl", logoUrl);
      if (logoFile) fd.set("logo", logoFile);
      const res = await saveSponsorAction(fd);
      if (res?.success) {
        setMsg({ type: "ok", text: "저장되었습니다. 다음 발송부터 적용됩니다." });
        setLogoUrl(res.sponsor.logoUrl || "");
        setLogoFile(null);
      } else {
        setMsg({ type: "err", text: res?.error || "저장 실패" });
      }
    } catch (e) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const sponsored = active && name.trim();

  // 미리보기용 헤더 (확정된 디자인 재현)
  const previewHeader = sponsored ? (
    <div>
      <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
        <strong style={{ color: "#444" }}>{PUBLISHER_EN}</strong> · {PUBLISHER_TAGLINE} | 2026년 06월 08일 (월)
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, color: "#888", border: "1px solid #ddd", borderRadius: 4, padding: "2px 8px", letterSpacing: 1 }}>SPONSORED BY</span>
        {logoPreview ? (
          <img src={logoPreview} alt={name} style={{ height: 40 }} />
        ) : (
          <span style={{ fontSize: 24, color: "#d1121d", fontWeight: "bold" }}>{name}</span>
        )}
      </div>
    </div>
  ) : (
    <div>
      <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>씬짜오베트남 데일리뉴스 | 2026년 06월 08일 (월)</div>
      <div style={{ fontSize: 24, color: "#d1121d", fontWeight: "bold" }}>씬짜오베트남 오늘의 뉴스</div>
    </div>
  );

  const previewSubject = `[${sponsored ? name : "씬짜오베트남"}] 데일리뉴스 | 2026년 06월 08일 (월)`;

  if (loading) return <div style={{ padding: 24 }}>불러오는 중...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: "bold" }}>명명권(스폰서) 설정</h1>
        <Link href="/admin" style={{ padding: "8px 16px", background: "#6b7280", color: "#fff", borderRadius: 6, textDecoration: "none" }}>← 대시보드</Link>
      </div>

      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "14px 18px", marginBottom: 24, fontSize: 14, color: "#1e40af", lineHeight: 1.7 }}>
        데일리뉴스 이메일/카드의 <b>제목·본문 헤더·카드 이미지</b>에 스폰서 이름과 로고를 넣습니다.
        보낸사람·발행인은 항상 <b>XinChao Daily News</b>로 고정되어 <b>발행 책임은 씬짜오에 남습니다</b>(스폰서는 "후원" 표기).
        <br />끄면(기본) 지금과 100% 동일하게 씬짜오 브랜딩으로 발송됩니다.
      </div>

      {/* 설정 폼 */}
      <section style={{ background: "#fff", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>명명권 적용 (켜면 다음 발송부터 스폰서 브랜딩)</span>
        </label>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>스폰서 이름</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 신한은행"
            style={{ width: "100%", maxWidth: 360, padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 15 }}
          />
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>제목 [이름]과 본문에 사용됩니다.</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>스폰서 로고</div>
          <div style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 10, lineHeight: 1.8, background: "#f9fafb", border: "1px solid #eee", borderRadius: 6, padding: "10px 14px" }}>
            • 형식: <b>PNG (투명배경 권장)</b> · JPG · WebP<br />
            • 권장 크기: <b>가로형</b>, 폭 400~800px / 높이 100~200px (가로:세로 약 3:1~5:1)<br />
            • 최대 2MB · 메일 헤더에선 높이 40px, 카드에선 높이 80px로 자동 축소돼 표시됩니다
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickFile} />

          {/* 로고 상태 박스 — 항상 표시해서 불러왔는지 한눈에 확인 */}
          <div style={{ marginTop: 12, padding: 14, background: logoPreview ? "#f0fdf4" : "#f9fafb", border: `1px solid ${logoPreview ? "#86efac" : "#e5e7eb"}`, borderRadius: 8, minHeight: 78, display: "flex", alignItems: "center", gap: 14 }}>
            {logoPreview ? (
              <>
                <img src={logoPreview} alt="로고" style={{ height: 50, maxWidth: 220, display: "block", objectFit: "contain" }} />
                <div style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>
                  ✓ 로고 불러옴{logoFile ? ` — ${logoFile.name}` : (logoUrl ? " (저장된 로고)" : "")}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#9ca3af" }}>📂 불러온 로고 없음 — 저장하면 스폰서 <b>이름 텍스트</b>가 대신 표시됩니다</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{ padding: "12px 28px", background: saving ? "#9ca3af" : "#0046ff", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          {msg && (
            <span style={{ fontSize: 14, color: msg.type === "ok" ? "#059669" : "#dc2626" }}>{msg.text}</span>
          )}
        </div>
      </section>

      {/* 실시간 미리보기 */}
      <section style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>미리보기 <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af" }}>(입력하면 자동으로 바뀝니다 · 저장 안 해도 미리 보여요)</span></h2>

        {active && !name.trim() && (
          <div style={{ fontSize: 13, color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, padding: "8px 12px", margin: "12px 0" }}>
            ⚠️ 명명권 적용이 켜져 있지만 <b>스폰서 이름이 비어 있어</b> 씬짜오로 발송됩니다. 위에서 이름을 입력하세요.
          </div>
        )}

        <div style={{ fontSize: 12, color: "#5f6368", background: "#f8f9fa", padding: "8px 12px", borderRadius: 6, marginBottom: 4, marginTop: 12 }}>
          받은편지함 보낸사람: <b>{PUBLISHER_EN}</b> (고정)
        </div>
        <div style={{ fontSize: 13, color: "#202124", padding: "6px 12px", marginBottom: 16, borderBottom: "1px solid #eee" }}>
          제목: {previewSubject}
        </div>
        <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 20 }}>
          {previewHeader}
        </div>
      </section>
    </div>
  );
}
