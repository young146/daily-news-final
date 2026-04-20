"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { getClientFirestore, getClientStorage } from "@/lib/firebase-client";

// 클라이언트 사이드 인스턴스 지연 생성
let db = null;
let storage = null;
if (typeof window !== "undefined") {
  db = getClientFirestore();
  storage = getClientStorage();
}

// ──────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────
const POSITIONS = [
  { value: "head", label: "헤드 배너 (상단)" },
  { value: "inner", label: "이너 배너 (중간/리스트 사이)" },
  { value: "bottom", label: "하단 배너 (바닥)" },
  { value: "popup", label: "전면 팝업 광고 (10초 지연)" },
];

const PAGE_TARGETS = [
  { value: "home", label: "🏠 메인 화면" },
  { value: "danggn", label: "🥕 당근 목록" },
  { value: "danggn-detail", label: "🥕 당근 상세" },
  { value: "realestate", label: "🏢 부동산 목록" },
  { value: "realestate-detail", label: "🏢 부동산 상세" },
  { value: "jobs", label: "💼 구인구직 목록" },
  { value: "jobs-detail", label: "💼 구인구직 상세" },
  { value: "magazine", label: "📰 매거진 목록" },
  { value: "magazine-detail", label: "📰 매거진 상세" },
  { value: "neighbor", label: "🏪 이웃사업" },
];

const POSITION_LABEL = {
  head: "상단",
  inner: "중간/본문",
  bottom: "하단",
  popup: "전면 팝업",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

function isActiveNow(ad) {
  const t = todayStr();
  return ad.isActive && ad.startDate <= t && ad.endDate >= t;
}

const emptyForm = () => ({
  title: "",
  position: "head",
  targetPages: [],
  type: "image",
  images: [],
  linkUrl: "",
  startDate: todayStr(),
  endDate: todayStr(),
  isActive: true,
  priority: 10,
  impressions: 0,
  clicks: 0,
});

// ──────────────────────────────────────────────
// 메인 페이지
// ──────────────────────────────────────────────
export default function AdminAdsPage() {
  const [ads, setAds] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [actionMsg, setActionMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const loadAds = useCallback(async () => {
    if (!db) return;
    setDataLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "app_ads"), orderBy("createdAt", "desc")));
      setAds(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("광고를 불러오는데 실패했습니다.", error);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  const notify = (msg, isError = false) => {
    if (isError) setErrorMsg(msg);
    else setActionMsg(msg);
    setTimeout(() => { setActionMsg(""); setErrorMsg(""); }, 3500);
  };

  const toggleActive = async (ad) => {
    await updateDoc(doc(db, "app_ads", ad.id), { isActive: !ad.isActive, updatedAt: serverTimestamp() });
    setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, isActive: !a.isActive } : a)));
    notify(`"${ad.title}" ${!ad.isActive ? "활성화" : "비활성화"} 완료`);
  };

  const deleteAd = async (ad) => {
    if (!confirm(`"${ad.title}" 광고를 삭제하시겠습니까?`)) return;
    // Storage 파일 삭제
    await Promise.allSettled(
      (ad.images || []).map((url) => deleteObject(ref(storage, url)).catch(() => {}))
    );
    await deleteDoc(doc(db, "app_ads", ad.id));
    setAds((prev) => prev.filter((a) => a.id !== ad.id));
    notify(`"${ad.title}" 삭제 완료`);
  };

  const onSaved = (updated, isNew) => {
    if (isNew) setAds((prev) => [updated, ...prev]);
    else setAds((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setShowForm(false);
    setEditTarget(null);
    notify(`"${updated.title}" ${isNew ? "등록" : "수정"} 완료`);
  };

  return (
    <div className="mx-auto max-w-6xl py-4 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-slate-800">🚀 앱 자체광고 관리</h1>
          <p className="text-sm text-slate-500">Firebase 실시간 동기화</p>
        </div>
        <div className="flex items-center gap-3">
          {actionMsg && <span className="rounded-lg bg-green-100 px-4 py-2 text-sm font-bold text-green-700">✅ {actionMsg}</span>}
          {errorMsg && <span className="rounded-lg bg-red-100 px-4 py-2 text-sm font-bold text-red-600">❌ {errorMsg}</span>}
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 shadow-sm transition-colors"
          >
            + 새 캠페인 등록
          </button>
        </div>
      </div>

      {/* 폼 및 리스트 영역 */}
      <div>
        {showForm && (
          <AdForm
            initial={editTarget}
            onSaved={onSaved}
            onCancel={() => { setShowForm(false); setEditTarget(null); }}
            onError={(msg) => notify(msg, true)}
          />
        )}

        {dataLoading ? (
           <div className="flex items-center justify-center py-20 bg-white rounded-xl border border-gray-200">
             <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
             <span className="ml-3 text-sm text-slate-500 font-medium">데이터를 불러오는 중...</span>
           </div>
        ) : (
          <div className="grid gap-4 mt-6">
            {!showForm && ads.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400 bg-white">
                아직 등록된 광고 캠페인이 없습니다.<br/>우측 상단의 버튼을 눌러 추가해보세요.
              </div>
            )}
            {!showForm && ads.map((ad) => (
              <AdRow
                key={ad.id}
                ad={ad}
                onToggle={() => toggleActive(ad)}
                onEdit={() => { setEditTarget(ad); setShowForm(true); }}
                onDelete={() => deleteAd(ad)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 광고 행 (리스트 아이템)
// ──────────────────────────────────────────────
function AdRow({ ad, onToggle, onEdit, onDelete }) {
  const active = isActiveNow(ad);
  const thumb = ad.images?.[0];

  return (
    <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-4 rounded-xl border bg-white p-4 shadow-sm transition-all ${!ad.isActive ? "opacity-60 bg-gray-50" : "hover:border-indigo-200 hover:shadow-md"}`}>
      {/* 썸네일 */}
      <div className="h-24 w-40 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200 self-center">
        {thumb ? (
          ad.type === "video" ? (
            <video src={thumb} className="h-full w-full object-cover" muted loop autoPlay playsInline />
          ) : (
            <div className="relative h-full w-full">
              <Image src={thumb} alt={ad.title} fill className="object-cover" sizes="160px" />
            </div>
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-slate-300">
            {ad.type === "video" ? "🎬" : "🖼"}
          </div>
        )}
      </div>

      {/* 기본 정보 */}
      <div className="min-w-0 flex-1 py-1">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <p className="truncate text-[15px] font-bold text-slate-900">{ad.title}</p>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            active ? "bg-green-100 text-green-700"
            : ad.isActive ? "bg-amber-100 text-amber-700"
            : "bg-gray-200 text-gray-500"
          }`}>
            {active ? "ON" : ad.isActive ? "기간 외" : "OFF"}
          </span>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-100">
            {POSITION_LABEL[ad.position] || ad.position}
          </span>
          <span className="text-[10px] text-slate-400 font-bold ml-1">
            ({
              ad.position === 'popup' ? '1080x1920' :
              ad.position === 'head' ? '1080x300' :
              ad.position === 'bottom' ? '1080x150' :
              '1080x450'
            })
          </span>
          <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 border border-purple-100">
            우선도 {ad.priority || 10}
          </span>
        </div>
        
        <div className="text-xs text-slate-500 space-y-1">
          <p className="line-clamp-1">
            <span className="font-semibold text-slate-700">📍 노출 탭:</span>{" "}
            {ad.targetPages?.length > 0
              ? ad.targetPages.map(p => PAGE_TARGETS.find(t => t.value === p)?.label.replace(/^[^\s]+ /, "") || p).join(", ")
              : "전체 탭 어디서나"}
          </p>
          <p className="truncate">🔗 {ad.linkUrl}</p>
          <p>📅 {ad.startDate} ~ {ad.endDate}</p>
        </div>
      </div>

      {/* 성과 지표 (Tracking) */}
      <div className="flex flex-row sm:flex-col gap-4 sm:gap-2 px-4 py-3 sm:py-0 bg-slate-50 sm:bg-transparent rounded-lg border border-slate-100 sm:border-0 justify-center">
         <div className="flex justify-between sm:justify-start items-center gap-3">
            <span className="text-xs text-slate-400 font-medium w-12">조회수</span>
            <span className="text-sm font-bold text-slate-700">{(ad.impressions || 0).toLocaleString()}</span>
         </div>
         <div className="flex justify-between sm:justify-start items-center gap-3">
            <span className="text-xs text-slate-400 font-medium w-12">클릭수</span>
            <span className="text-sm font-bold text-indigo-600">{(ad.clicks || 0).toLocaleString()}</span>
         </div>
         <div className="flex justify-between sm:justify-start items-center gap-3">
            <span className="text-xs text-slate-400 font-medium w-12">전환율</span>
            <span className="text-xs font-semibold text-teal-600">
               {ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : "0.00"}%
            </span>
         </div>
      </div>

      {/* 액션 버튼 그룹 */}
      <div className="flex flex-row sm:flex-col shrink-0 items-center gap-2 justify-end sm:border-l sm:border-slate-100 sm:pl-4">
        <button onClick={onToggle}
          className={`flex-1 sm:flex-none w-full rounded-lg px-3 py-1.5 text-xs font-bold transition-colors shadow-sm ${
            ad.isActive ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-green-100 text-green-800 hover:bg-green-200"
          }`}>
          {ad.isActive ? "⏸ 비활성화" : "▶ 활성화"}
        </button>
        <button onClick={onEdit}
          className="flex-1 sm:flex-none w-full rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-200 transition-colors shadow-sm">
          ✏️ 수정
        </button>
        <button onClick={onDelete}
          className="flex-1 sm:flex-none w-full rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors shadow-sm">
          🗑 삭제
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 광고 추가/수정 폼
// ──────────────────────────────────────────────
function AdForm({ initial, onSaved, onCancel, onError }) {
  const [form, setForm] = useState(initial ? {
      title: initial.title, position: initial.position, type: initial.type, images: initial.images || [], linkUrl: initial.linkUrl, targetPages: initial.targetPages || [], startDate: initial.startDate, endDate: initial.endDate, isActive: initial.isActive, priority: initial.priority || 10, impressions: initial.impressions || 0, clicks: initial.clicks || 0
  } : emptyForm());

  const [existingImages, setExistingImages] = useState(initial?.images || []);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const togglePage = (p) => {
    set(
      "targetPages",
      form.targetPages.includes(p) ? form.targetPages.filter((x) => x !== p) : [...form.targetPages, p]
    );
  };

  const onFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (form.type === "video") {
      const f = files[0];
      setPendingFiles([{ file: f, preview: URL.createObjectURL(f) }]);
      setExistingImages([]); 
    } else {
      const newItems = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
      setPendingFiles((prev) => [...prev, ...newItems]);
    }
    e.target.value = "";
  };

  const removeExisting = (url) => setExistingImages((prev) => prev.filter((u) => u !== url));
  const removePending = (idx) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

  const changeType = (t) => {
    set("type", t);
    setExistingImages([]);
    setPendingFiles([]);
  };

  const uploadOne = (f, onProgress) => {
    const ext = f.name.split(".").pop();
    const path = `app_ads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const storageRef = ref(storage, path);
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, f);
      task.on("state_changed",
        (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        async () => resolve(await getDownloadURL(task.snapshot.ref)),
      );
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) { onError("광고 제목을 입력해주세요."); return; }
    if (!form.linkUrl.trim()) { onError("클릭 연결 URL을 입력해주세요."); return; }
    if (existingImages.length === 0 && pendingFiles.length === 0) {
      onError("이미지 또는 동영상을 업로드해주세요."); return;
    }
    if (form.startDate > form.endDate) { onError("종료일이 시작일보다 빠릅니다."); return; }

    setSaving(true);
    try {
      let newUrls = [];

      if (pendingFiles.length > 0) {
        setUploading(true);
        const total = pendingFiles.length;
        let done = 0;
        newUrls = await Promise.all(
          pendingFiles.map((item) =>
            uploadOne(item.file, (p) => {
              setUploadProgress(Math.round((done / total) * 100 + p / total));
            }).then((url) => { done++; return url; }),
          ),
        );
        setUploading(false);
      }

      const finalImages = [...existingImages, ...newUrls];
      const payload = {
        ...form,
        images: finalImages,
        updatedAt: serverTimestamp(),
      };

      if (initial) {
        await updateDoc(doc(db, "app_ads", initial.id), payload);
        onSaved({ ...initial, ...form, images: finalImages }, false);
      } else {
        const docRef = await addDoc(collection(db, "app_ads"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        onSaved({ id: docRef.id, ...form, images: finalImages }, true);
      }
    } catch (e) {
      onError("저장 중 오류가 발생했습니다.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border-2 border-indigo-100 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-extrabold text-slate-800 flex items-center gap-2">
        {initial ? "✏️ 광고 수정하기" : "🚀 신규 광고 등록하기"}
      </h2>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* 광고 제목 */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-bold text-slate-700">캠페인 제목 <span className="text-red-500">*</span></label>
          <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)}
            placeholder="예: 4월 코리안에어 항공권 이벤트 배너"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
        </div>

        {/* 광고 위치 */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">광고 슬롯(위치) <span className="text-red-500">*</span></label>
          <select value={form.position} onChange={(e) => set("position", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all">
            {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {/* 우선순위 */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">우선순위 (낮을수록 선호출)</label>
          <input type="number" min={1} max={99} value={form.priority}
            onChange={(e) => set("priority", Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
        </div>

        {/* 링크 URL */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-bold text-slate-700">클릭 이동 URL <span className="text-red-500">*</span></label>
          <input type="url" value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
          <p className="mt-1.5 text-xs text-slate-500 ml-1">※ 앱 클릭 시 바로 이 링크로 이동하게 됩니다 (웹 브라우저 혹은 내부 딥링크 지원).</p>
        </div>

        {/* 페이지 타겟팅 */}
        <div className="sm:col-span-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <label className="mb-3 block text-sm font-bold text-slate-700">
            노출 타겟팅 페이지 <span className="font-normal text-slate-500 text-xs ml-2">(아무것도 선택하지 않으면 '모든' 화면에서 노출됩니다)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PAGE_TARGETS.map((p) => (
              <button key={p.value} type="button" onClick={() => togglePage(p.value)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                  form.targetPages.includes(p.value)
                    ? "border-indigo-600 bg-indigo-600 text-white shadow-md transform scale-105"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 시작일 / 종료일 */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">노출 시작일</label>
          <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">노출 종료일</label>
          <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
        </div>

        {/* 업로드 영역 */}
        <div className="sm:col-span-2 mt-2">
          <div className="flex items-center justify-between mb-2">
             <div className="flex flex-col">
                <label className="block text-sm font-bold text-slate-700">배너/영상 업로드 <span className="text-red-500">*</span></label>
                <div className="mt-1 flex items-center gap-2">
                   <span className="text-[10px] sm:text-xs font-bold text-indigo-500 bg-indigo-50 rounded px-2 py-0.5 border border-indigo-100">
                      권장 사이즈: {
                        form.position === 'popup' ? '1080 x 1920' :
                        form.position === 'head' ? '1080 x 300' :
                        form.position === 'bottom' ? '1080 x 150' :
                        '1080 x 450'
                      } px
                   </span>
                </div>
             </div>
             <div className="flex bg-slate-100 p-1 rounded-lg">
               {(["image", "video"]).map((t) => (
                 <button key={t} type="button" onClick={() => changeType(t)}
                   className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${
                     form.type === t ? "bg-white shadow-sm text-slate-800" : "text-slate-500"
                   }`}>
                   {t === "image" ? "이미지 (다중가능)" : "영상 (mp4 단일)"}
                 </button>
               ))}
             </div>
          </div>

          <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
            <div className="flex flex-wrap gap-4 items-center">
              {/* 기본 이미지들 */}
              {existingImages.map((url) => (
                <div key={url} className="relative h-[120px] w-[200px] overflow-hidden rounded-xl bg-slate-200 border border-slate-300 shadow-sm">
                  {form.type === "video" ? (
                    <video src={url} className="h-full w-full object-cover" muted />
                  ) : (
                    <Image src={url} alt="" fill className="object-cover" sizes="200px" />
                  )}
                  <button onClick={() => removeExisting(url)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-red-500/90 h-6 w-6 flex items-center justify-center text-white text-xs hover:bg-red-600 shadow-sm">
                    ✕
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">기존 자산</span>
                </div>
              ))}

              {/* 신규 파일들 */}
              {pendingFiles.map((item, idx) => (
                <div key={idx} className="relative h-[120px] w-[200px] overflow-hidden rounded-xl bg-slate-200 border border-blue-300 shadow-sm">
                  {form.type === "video" ? (
                    <video src={item.preview} className="h-full w-full object-cover" muted />
                  ) : (
                    <Image src={item.preview} alt="" fill className="object-cover" sizes="200px" unoptimized />
                  )}
                  <button onClick={() => removePending(idx)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-red-500/90 h-6 w-6 flex items-center justify-center text-white text-xs hover:bg-red-600 shadow-sm">
                    ✕
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-blue-500/90 px-1.5 py-0.5 text-[10px] text-white font-bold">New</span>
                </div>
              ))}

              {!(form.type === "video" && (existingImages.length || pendingFiles.length)) && (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex h-[120px] w-[200px] shrink-0 flex-col items-center justify-center rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-100">
                  <span className="text-3xl mb-2">📁</span>
                  <span>{form.type === "image" ? "이미지 찾기" : "동영상 찾기"}</span>
                </button>
              )}
            </div>

            <input ref={fileRef} type="file"
              accept={form.type === "image" ? "image/*" : "video/mp4"}
              multiple={form.type === "image"}
              className="hidden"
              onChange={onFileChange} />

            {uploading && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-indigo-500 transition-all duration-300 ease-out shadow-sm" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="mt-1.5 text-xs font-bold text-indigo-600 text-center">열심히 업로드 중입니다... {uploadProgress}%</p>
              </div>
            )}
          </div>
        </div>

        {/* 토글 상태 */}
        <div className="sm:col-span-2 pt-4 border-t border-gray-100">
           <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
             <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800">캠페인 활성화 상태</span>
                <span className="text-xs text-slate-500">비활성화 시 앱에서 노출되지 않습니다. 조회/클릭 카운트는 보존됩니다.</span>
             </div>
             <div className="flex-1" />
             <button type="button" onClick={() => set("isActive", !form.isActive)}
               className={`relative h-8 w-14 rounded-full transition-colors shadow-inner flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 ${form.isActive ? "bg-green-500 focus:ring-green-400" : "bg-slate-300 focus:ring-slate-300"}`}>
               <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${form.isActive ? "left-7" : "left-1"}`} />
             </button>
           </div>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
        <button onClick={onCancel}
          className="rounded-xl border border-slate-300 px-6 py-2.5 text-sm font-bold text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-colors">
          취소하기
        </button>
        <button onClick={handleSave} disabled={saving}
          className="rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
          {saving ? "저장 중..." : initial ? "수정사항 저장" : "새 광고캠페인 등록"}
        </button>
      </div>
    </div>
  );
}
