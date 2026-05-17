"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getClientStorage } from "@/lib/firebase-client";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { autoLinkHtml } from "@/lib/html-utils";
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

const stripHtml = (html) => {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, '');
};

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

    const emptyForm = { title: "", description: "", imageUrl: "", videoUrl: "", linkUrl: "", isActive: true, sortOrder: 0, kind: "ad", category: "" };
    const [form, setForm] = useState(emptyForm);
    const [filter, setFilter] = useState("all"); // "all" | "ad" | "self"

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
        setForm({ title: card.title, description: card.description || "", imageUrl: card.imageUrl || "", videoUrl: card.videoUrl || "", linkUrl: card.linkUrl, isActive: card.isActive, sortOrder: card.sortOrder, kind: card.kind || "ad", category: card.category || "" });
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
                            <ReactQuill 
                                theme="snow" 
                                value={form.description} 
                                onChange={(val) => setForm((f) => ({ ...f, description: val }))} 
                                placeholder="예: 베트남 한인 중고거래 & 나눔 커뮤니티에 참여하세요! (텍스트 서식, 색상 등 설정 가능)" 
                            />
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
                        <div>
                            <label style={lbl}>📂 종류 <span style={{ color: "#ef4444" }}>*</span></label>
                            <div style={{ display: "flex", gap: "16px" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "6px 12px", borderRadius: "6px", background: form.kind === "ad" ? "#fef3c7" : "transparent", border: form.kind === "ad" ? "1px solid #f59e0b" : "1px solid #e5e7eb" }}>
                                    <input type="radio" checked={form.kind === "ad"} onChange={() => setForm((f) => ({ ...f, kind: "ad", category: "" }))} />
                                    💰 광고주 카드 <span style={{ fontSize: "12px", color: "#9ca3af" }}>(수익원)</span>
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "6px 12px", borderRadius: "6px", background: form.kind === "self" ? "#dbeafe" : "transparent", border: form.kind === "self" ? "1px solid #3b82f6" : "1px solid #e5e7eb" }}>
                                    <input type="radio" checked={form.kind === "self"} onChange={() => setForm((f) => ({ ...f, kind: "self" }))} />
                                    🏷️ 자체 홍보 <span style={{ fontSize: "12px", color: "#9ca3af" }}>(앱·매거진 등)</span>
                                </label>
                            </div>
                        </div>
                        {form.kind === "self" && (
                            <div>
                                <label style={lbl}>🏷️ 카테고리 <span style={{ color: "#9ca3af", fontWeight: "normal" }}>(자체 홍보용)</span></label>
                                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={inp}>
                                    <option value="">— 선택 —</option>
                                    <option value="app">앱 설치</option>
                                    <option value="magazine">매거진/콘텐츠</option>
                                    <option value="event">이벤트</option>
                                    <option value="other">기타</option>
                                </select>
                            </div>
                        )}
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>
                        📋 보관된 홍보카드 <span style={{ fontSize: "14px", color: "#6b7280", fontWeight: "normal" }}>({cards.length}개)</span>
                    </h2>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                        <span style={{ color: "#16a34a", fontWeight: "bold" }}>● ON</span> = 표시중 &nbsp;
                        <span style={{ color: "#dc2626", fontWeight: "bold" }}>● OFF</span> = 보관중
                    </div>
                </div>

                {/* 필터 탭 */}
                {(() => {
                    const adCount = cards.filter((c) => (c.kind || "ad") === "ad").length;
                    const selfCount = cards.filter((c) => c.kind === "self").length;
                    const tabStyle = (active) => ({ padding: "8px 16px", borderRadius: "8px", border: active ? "2px solid #f97316" : "1px solid #e5e7eb", background: active ? "#fff7ed" : "white", color: active ? "#c2410c" : "#374151", fontWeight: active ? "bold" : "normal", fontSize: "13px", cursor: "pointer" });
                    return (
                        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                            <button onClick={() => setFilter("all")} style={tabStyle(filter === "all")}>전체 ({cards.length})</button>
                            <button onClick={() => setFilter("ad")} style={tabStyle(filter === "ad")}>💰 광고주 ({adCount})</button>
                            <button onClick={() => setFilter("self")} style={tabStyle(filter === "self")}>🏷️ 자체 홍보 ({selfCount})</button>
                        </div>
                    );
                })()}

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
                        {cards.filter((c) => filter === "all" || (c.kind || "ad") === filter).map((card) => {
                            const thumb = getThumb(card);
                            const isSelf = card.kind === "self";
                            return (
                                <div key={card.id} style={{ borderRadius: "12px", border: card.isActive ? "2px solid #fed7aa" : "2px solid #e5e7eb", overflow: "hidden", background: card.isActive ? "#fff" : "#f9fafb", boxShadow: card.isActive ? "0 2px 8px rgba(249,115,22,0.12)" : "none", opacity: card.isActive ? 1 : 0.75, position: "relative" }}>
                                    {/* ON/OFF 배지 */}
                                    <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 2, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "bold", background: card.isActive ? "#dcfce7" : "#fee2e2", color: card.isActive ? "#16a34a" : "#dc2626", border: `1px solid ${card.isActive ? "#86efac" : "#fca5a5"}` }}>
                                        {card.isActive ? "● ON" : "● OFF"}
                                    </div>
                                    {/* 종류 배지 (좌상단) */}
                                    <div style={{ position: "absolute", top: "10px", left: "10px", zIndex: 2, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "bold", background: isSelf ? "#dbeafe" : "#fef3c7", color: isSelf ? "#1d4ed8" : "#92400e", border: `1px solid ${isSelf ? "#93c5fd" : "#fcd34d"}` }}>
                                        {isSelf ? `🏷️ 자체${card.category ? ` · ${card.category}` : ""}` : "💰 광고주"}
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
                                            <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 8px 0", lineHeight: "1.5", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{stripHtml(card.description)}</p>
                                        )}
                                        <a href={card.linkUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#3b82f6", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "10px" }}>
                                            🔗 {card.linkUrl}
                                        </a>
                                        <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "12px" }}>
                                            순서: {card.sortOrder} | {new Date(card.createdAt).toLocaleDateString("ko-KR")} 등록
                                        </div>
                                        {/* 액션 버튼 4개 */}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
                                            <button onClick={() => {
                                                navigator.clipboard.writeText(`https://chaovietnam.co.kr/promo/${card.id}`).then(() => showMsg(`📋 링크 복사됨! 카카오톡에 붙여넣기`));
                                            }} style={btn("#fef9c3", "#92400e")}>🔗 링크 복사</button>
                                            <a href={`/promo/${card.id}`} target="_blank" rel="noopener noreferrer" style={{ ...btn("#f0fdf4", "#15803d"), textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>📱 페이지 열기</a>
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

            {/* 미리보기 모달 - 이메일 수신 시 모습 그대로 */}
            {previewCard && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }} onClick={() => setPreviewCard(null)}>
                    {/* 이메일 배경 래퍼 (최대폭 600px, 회색 바탕) */}
                    <div style={{ maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", background: "#f9f9f9", padding: "20px", borderRadius: "12px", border: "1px solid #ddd", position: "relative" }} onClick={(e) => e.stopPropagation()}>
                        
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <span style={{ color: "#333", fontWeight: "bold", fontSize: "14px" }}>✉️ 이메일로 고객이 받는 실제 크기 (600px)</span>
                            <button onClick={() => setPreviewCard(null)} style={{ background: "rgba(0,0,0,0.1)", border: "none", borderRadius: "50%", width: "28px", height: "28px", fontSize: "14px", cursor: "pointer", color: "#333" }}>✕</button>
                        </div>

                        {/* 실제 이메일 안쪽 흰색 카드 */}
                        <div style={{ borderRadius: "12px", background: "#fff", border: "1px solid #eee", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                            {getThumb(previewCard) && (
                                <img src={getThumb(previewCard)} alt={previewCard.title} style={{ width: "100%", height: "auto", borderRadius: "8px", display: "block", marginBottom: "12px" }} />
                            )}
                            <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", fontWeight: "bold", color: "#333", lineHeight: "1.4" }}>
                                {previewCard.title}
                            </h3>
                            {previewCard.description && (
                                <div className="ql-snow" style={{ margin: "0 0 14px 0" }}>
                                    <div 
                                        className="ql-editor"
                                        style={{ padding: 0, fontSize: "13px", color: "#555", lineHeight: "1.5", wordBreak: "break-word" }}
                                        dangerouslySetInnerHTML={{ __html: autoLinkHtml(previewCard.description) }}
                                    />
                                </div>
                            )}
                            <div style={{ textAlign: "center", marginTop: "16px" }}>
                                <a href={previewCard.linkUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ display: "inline-block", padding: "10px 24px", background: "#f97316", color: "#ffffff", borderRadius: "6px", textDecoration: "none", fontWeight: "bold", fontSize: "14px" }}>
                                    자세히 보기
                                </a>
                            </div>
                        </div>
                        <p style={{ textAlign: "center", color: "#9ca3af", fontSize: "12px", marginTop: "16px" }}>

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
