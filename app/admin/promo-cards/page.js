"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getClientStorage } from "@/lib/firebase-client";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// URL을 자동으로 클릭 가능한 링크로 변환
const linkify = (text) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) =>
        urlRegex.test(part)
            ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "underline", wordBreak: "break-all" }}>{part}</a>
            : part
    );
};

export default function PromoCardsPage() {
    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingCard, setEditingCard] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [previewCard, setPreviewCard] = useState(null);
    const fileInputRef = useRef(null);

    const emptyForm = { title: "", description: "", imageUrl: "", videoUrl: "", linkUrl: "", isActive: true, sortOrder: 0 };
    const [form, setForm] = useState(emptyForm);

    useEffect(() => { fetchCards(); }, []);

    const fetchCards = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/promo-cards");
            const data = await res.json();
            setCards(data.cards || []);
        } catch { showMsg("카드 목록을 불러오는데 실패했습니다.", "error"); }
        finally { setLoading(false); }
    };

    const showMsg = (text, type = "success") => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const openNewForm = () => { setEditingCard(null); setForm(emptyForm); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
    const openEditForm = (card) => {
        setEditingCard(card);
        setForm({ title: card.title, description: card.description || "", imageUrl: card.imageUrl || "", videoUrl: card.videoUrl || "", linkUrl: card.linkUrl, isActive: card.isActive, sortOrder: card.sortOrder });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const cancelForm = () => { setShowForm(false); setEditingCard(null); setForm(emptyForm); };

    const handleImageUpload = async (file) => {
        if (!file) return;
        setUploading(true);
        try {
            const storage = getClientStorage();
            const fileName = `form_uploads/promo/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setForm((f) => ({ ...f, imageUrl: url }));
            showMsg("✅ 이미지 업로드 완료!");
        } catch (e) { showMsg("이미지 업로드 오류: " + e.message, "error"); }
        finally { setUploading(false); }
    };

    const handleSave = async () => {
        if (!form.title.trim() || !form.linkUrl.trim()) { showMsg("제목과 링크 URL은 필수입니다.", "error"); return; }
        setSaving(true);
        try {
            const url = editingCard ? `/api/promo-cards/${editingCard.id}` : "/api/promo-cards";
            const res = await fetch(url, { method: editingCard ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, sortOrder: parseInt(form.sortOrder) || 0 }) });
            const data = await res.json();
            if (data.success) { showMsg(editingCard ? "✅ 수정 완료!" : "✅ 홍보카드 추가 완료!"); cancelForm(); fetchCards(); }
            else showMsg("저장 실패: " + data.error, "error");
        } catch (e) { showMsg("저장 오류: " + e.message, "error"); }
        finally { setSaving(false); }
    };

    const handleToggleActive = async (card) => {
        try {
            const res = await fetch(`/api/promo-cards/${card.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !card.isActive }) });
            const data = await res.json();
            if (data.success) fetchCards();
        } catch (e) { showMsg("상태 변경 실패: " + e.message, "error"); }
    };

    const handleDelete = async (card) => {
        if (!confirm(`"${card.title}" 카드를 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch(`/api/promo-cards/${card.id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) { showMsg("🗑️ 삭제 완료!"); fetchCards(); }
        } catch (e) { showMsg("삭제 실패: " + e.message, "error"); }
    };

    const getYouTubeId = (url) => {
        if (!url) return null;
        const m = url.match(/(?:youtube\.com.*v=|youtu\.be\/)([^&\n?#]+)/);
        return m ? m[1] : null;
    };
    const getThumb = (card) => {
        if (card.imageUrl) return card.imageUrl;
        const ytId = getYouTubeId(card.videoUrl);
        return ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;
    };

    return (
        <div style={{ padding: "20px", maxWidth: "1000px", margin: "0 auto" }}>
            {/* 헤더 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <div>
                    <h1 style={{ fontSize: "26px", fontWeight: "bold", margin: 0 }}>📣 홍보카드 관리</h1>
                    <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "4px" }}>뉴스 공유 시 함께 표시될 홍보카드를 관리합니다. 코드 수정 없이 언제든 변경 가능합니다.</p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                    <Link href="/admin" style={{ padding: "8px 16px", background: "#6b7280", color: "white", borderRadius: "6px", textDecoration: "none", fontSize: "14px" }}>← 대시보드</Link>
                    {!showForm && (
                        <button onClick={openNewForm} style={{ padding: "8px 16px", background: "#f97316", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "14px" }}>
                            + 새 홍보카드
                        </button>
                    )}
                </div>
            </div>

            {/* 알림 */}
            {message && (
                <div style={{ padding: "12px 16px", borderRadius: "8px", marginBottom: "16px", fontWeight: "bold", background: message.type === "error" ? "#fee2e2" : "#dcfce7", color: message.type === "error" ? "#991b1b" : "#166534", border: `1px solid ${message.type === "error" ? "#fca5a5" : "#86efac"}` }}>
                    {message.text}
                </div>
            )}

            {/* 작성/수정 폼 */}
            {showForm && (
                <div style={{ background: "white", border: "2px solid #f97316", borderRadius: "12px", padding: "24px", marginBottom: "24px", boxShadow: "0 4px 12px rgba(249,115,22,0.15)" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "bold", color: "#c2410c", marginBottom: "20px" }}>{editingCard ? "✏️ 홍보카드 수정" : "✨ 새 홍보카드 작성"}</h2>
                    <div style={{ display: "grid", gap: "16px" }}>
                        <div>
                            <label style={lbl}>📌 제목 <span style={{ color: "#ef4444" }}>*</span></label>
                            <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="예: 씬짜오 당근/나눔 오픈채팅" style={inp} />
                        </div>
                        <div>
                            <label style={lbl}>📝 홍보 문구 / 설명</label>
                            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="예: 베트남 한인 중고거래 & 나눔 커뮤니티에 참여하세요!" rows={3} style={{ ...inp, resize: "vertical" }} />
                        </div>
                        <div>
                            <label style={lbl}>🖼️ 홍보 이미지</label>
                            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                <div style={{ flex: 1 }}>
                                    <input type="text" value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="이미지 URL (업로드 후 자동 입력됩니다)" style={inp} />
                                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleImageUpload(e.target.files[0])} />
                                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                                        style={{ marginTop: "8px", padding: "8px 16px", background: uploading ? "#9ca3af" : "#3b82f6", color: "white", border: "none", borderRadius: "6px", cursor: uploading ? "not-allowed" : "pointer", fontSize: "13px" }}>
                                        {uploading ? "⏳ 업로드 중..." : "📁 이미지 파일 선택 → Firebase 저장"}
                                    </button>
                                </div>
                                {form.imageUrl && (
                                    <img src={form.imageUrl} alt="미리보기" style={{ width: "120px", height: "80px", objectFit: "cover", borderRadius: "8px", border: "2px solid #e5e7eb" }} onError={(e) => { e.target.style.display = "none"; }} />
                                )}
                            </div>
                        </div>
                        <div>
                            <label style={lbl}>🎬 동영상 URL <span style={{ color: "#9ca3af", fontWeight: "normal" }}>(선택 — YouTube 링크)</span></label>
                            <input type="text" value={form.videoUrl} onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))} placeholder="예: https://www.youtube.com/watch?v=xxxxx" style={inp} />
                            {getYouTubeId(form.videoUrl) && (
                                <div style={{ marginTop: "8px", borderRadius: "8px", overflow: "hidden", maxWidth: "320px" }}>
                                    <iframe src={`https://www.youtube.com/embed/${getYouTubeId(form.videoUrl)}`} width="320" height="180" frameBorder="0" allowFullScreen style={{ display: "block" }} />
                                </div>
                            )}
                        </div>
                        <div>
                            <label style={lbl}>🔗 클릭 링크 <span style={{ color: "#ef4444" }}>*</span></label>
                            <input type="text" value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="예: https://open.kakao.com/o/gDITUGji" style={inp} />
                        </div>
                        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                            <div>
                                <label style={lbl}>🔢 정렬 순서</label>
                                <input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} style={{ ...inp, width: "80px" }} />
                                <span style={{ fontSize: "12px", color: "#9ca3af", marginLeft: "8px" }}>낮을수록 먼저 표시</span>
                            </div>
                            <div>
                                <label style={lbl}>🔘 활성화</label>
                                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                                    <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} style={{ width: "18px", height: "18px" }} />
                                    <span style={{ fontSize: "14px", color: form.isActive ? "#16a34a" : "#9ca3af", fontWeight: "600" }}>{form.isActive ? "ON (표시됨)" : "OFF (숨김)"}</span>
                                </label>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: "12px", paddingTop: "8px" }}>
                            <button onClick={handleSave} disabled={saving}
                                style={{ flex: 1, padding: "12px", background: saving ? "#9ca3af" : "#f97316", color: "white", border: "none", borderRadius: "8px", cursor: saving ? "not-allowed" : "pointer", fontWeight: "bold", fontSize: "15px" }}>
                                {saving ? "저장 중..." : editingCard ? "✅ 수정 저장" : "✅ 홍보카드 등록"}
                            </button>
                            <button onClick={cancelForm} style={{ padding: "12px 24px", background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>취소</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 카드 목록 (그리드 프리뷰) */}
            <div style={{ background: "white", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>
                        📋 보관된 홍보카드 <span style={{ fontSize: "14px", color: "#6b7280", fontWeight: "normal" }}>({cards.length}개)</span>
                    </h2>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                        <span style={{ color: "#16a34a", fontWeight: "bold" }}>● ON</span> = 표시중 &nbsp;
                        <span style={{ color: "#dc2626", fontWeight: "bold" }}>● OFF</span> = 보관중
                    </div>
                </div>

                {loading ? (
                    <p style={{ color: "#9ca3af", textAlign: "center", padding: "40px" }}>불러오는 중...</p>
                ) : cards.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
                        <p style={{ fontSize: "40px" }}>📭</p>
                        <p>등록된 홍보카드가 없습니다.</p>
                        <button onClick={openNewForm} style={{ marginTop: "12px", padding: "8px 20px", background: "#f97316", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>
                            + 첫 번째 홍보카드 만들기
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                        {cards.map((card) => {
                            const thumb = getThumb(card);
                            return (
                                <div key={card.id} style={{ borderRadius: "12px", border: card.isActive ? "2px solid #fed7aa" : "2px solid #e5e7eb", overflow: "hidden", background: card.isActive ? "#fff" : "#f9fafb", boxShadow: card.isActive ? "0 2px 8px rgba(249,115,22,0.12)" : "none", opacity: card.isActive ? 1 : 0.75, position: "relative" }}>
                                    {/* ON/OFF 배지 */}
                                    <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 2, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "bold", background: card.isActive ? "#dcfce7" : "#fee2e2", color: card.isActive ? "#16a34a" : "#dc2626", border: `1px solid ${card.isActive ? "#86efac" : "#fca5a5"}` }}>
                                        {card.isActive ? "● ON" : "● OFF"}
                                    </div>
                                    {/* 썸네일 */}
                                    {thumb ? (
                                        <img src={thumb} alt={card.title} style={{ width: "100%", height: "160px", objectFit: "contain", background: "#f8f8f8", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
                                    ) : (
                                        <div style={{ width: "100%", height: "120px", background: "linear-gradient(135deg, #fff7ed, #fed7aa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "40px" }}>📣</div>
                                    )}
                                    {/* 카드 내용 */}
                                    <div style={{ padding: "14px" }}>
                                        <h3 style={{ fontSize: "15px", fontWeight: "bold", margin: "0 0 6px 0", color: "#1f2937", lineHeight: "1.4" }}>{card.title}</h3>
                                        {card.description && (
                                            <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 8px 0", lineHeight: "1.5", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.description}</p>
                                        )}
                                        <a href={card.linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#3b82f6", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "10px" }}>
                                            🔗 {card.linkUrl}
                                        </a>
                                        <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "12px" }}>
                                            순서: {card.sortOrder} | {new Date(card.createdAt).toLocaleDateString("ko-KR")} 등록
                                        </div>
                                        {/* 액션 버튼 4개 */}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "5px" }}>
                                            <button onClick={() => setPreviewCard(card)} style={btn("#eff6ff", "#1d4ed8")}>👁️ 미리보기</button>
                                            <button onClick={() => handleToggleActive(card)} style={btn(card.isActive ? "#dcfce7" : "#fee2e2", card.isActive ? "#16a34a" : "#dc2626")}>{card.isActive ? "⏸ OFF" : "▶ ON"}</button>
                                            <button onClick={() => openEditForm(card)} style={btn("#f3f4f6", "#374151")}>✏️ 수정</button>
                                            <button onClick={() => handleDelete(card)} style={btn("#fee2e2", "#dc2626")}>🗑️ 삭제</button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 미리보기 모달 - 고객에게 보이는 카드 그대로 */}
            {previewCard && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }} onClick={() => setPreviewCard(null)}>
                    <div style={{ maxWidth: "340px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
                        {/* 닫기 버튼 */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <span style={{ color: "white", fontWeight: "bold", fontSize: "14px" }}>📱 고객에게 보이는 카드 미리보기</span>
                            <button onClick={() => setPreviewCard(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: "32px", height: "32px", fontSize: "16px", cursor: "pointer", color: "white" }}>✕</button>
                        </div>
                        {/* 실제 카드 — 관리 버튼 없이 고객 뷰 그대로 */}
                        <div style={{ borderRadius: "16px", overflow: "hidden", background: "white", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
                            {getThumb(previewCard) ? (
                                <img src={getThumb(previewCard)} alt={previewCard.title} style={{ width: "100%", maxHeight: "220px", objectFit: "contain", background: "#f8f8f8", display: "block" }} />
                            ) : (
                                <div style={{ width: "100%", height: "140px", background: "linear-gradient(135deg, #fff7ed, #fed7aa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px" }}>📣</div>
                            )}
                            <div style={{ padding: "18px" }}>
                                <h3 style={{ margin: "0 0 10px 0", fontSize: "17px", fontWeight: "bold", color: "#1f2937", lineHeight: "1.4" }}>
                                    {previewCard.title}
                                </h3>
                                {previewCard.description && (
                                    <p style={{ margin: "0 0 14px 0", fontSize: "14px", color: "#555", lineHeight: "1.7", whiteSpace: "pre-wrap" }}>
                                        {linkify(previewCard.description)}
                                    </p>
                                )}
                                <a href={previewCard.linkUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ display: "block", textAlign: "center", padding: "12px", background: "#f97316", color: "white", borderRadius: "10px", textDecoration: "none", fontWeight: "bold", fontSize: "15px" }}>
                                    자세히 보기 →
                                </a>
                            </div>
                        </div>
                        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: "12px", marginTop: "12px" }}>
                            화면 바깥을 클릭하면 닫힙니다
                        </p>
                    </div>
                </div>
            )}

        </div>
    );
}

const lbl = { display: "block", fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "6px" };
const inp = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", outline: "none", boxSizing: "border-box" };
const btn = (bg, color) => ({ padding: "6px 4px", background: bg, color, border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: "bold", textAlign: "center" });
