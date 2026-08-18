"use client";

// ──────────────────────────────────────────────
// 통합 광고센터 (ad-center)
// 앱 + vnkorlife.com + chaovietnam.co.kr 3개 지면의 자체 광고를
// 한 곳에서 등록/관리한다. 단일 소스 = Firestore `ads_unified`.
//
// ⚠️ 기존 /admin/ads(app_ads)와 완전히 별개다. app_ads는 절대 건드리지 않는다.
// 상세 설계: PROGRESS_UNIFIED_ADS.md
// ──────────────────────────────────────────────

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

const COLLECTION = "ads_unified";

// 클라이언트 사이드 인스턴스 지연 생성
let db = null;
let storage = null;
if (typeof window !== "undefined") {
  db = getClientFirestore();
  storage = getClientStorage();
}

// ──────────────────────────────────────────────
// 상수 — 지면(surface)과 지면별 위치(placement)
// ──────────────────────────────────────────────
const SURFACES = [
  { key: "app", label: "📱 앱", color: "indigo" },
  { key: "vnkorlife", label: "🌐 vnkorlife.com", color: "emerald" },
  { key: "chaovietnam", label: "📰 chaovietnam.co.kr", color: "orange" },
];

// 지면별 노출 위치 선택지. chaovietnam은 워드프레스 Ad Inserter가 위치를 담당하므로 단일 슬롯.
const PLACEMENTS = {
  app: [
    { value: "head", label: "헤드 배너 (상단)" },
    { value: "inner", label: "이너 배너 (리스트 사이)" },
    { value: "bottom", label: "하단 배너" },
    { value: "popup", label: "전면 팝업 (10초 지연)" },
  ],
  vnkorlife: [
    { value: "top", label: "상단 배너" },
    { value: "in-content", label: "본문 내 배너" },
    { value: "bottom", label: "하단 배너" },
    { value: "sidebar", label: "사이드바" },
  ],
  chaovietnam: [
    { value: "top", label: "본문 상단" },
    { value: "in-content", label: "본문 중간 (매 2단락마다 자동)" },
    { value: "bottom", label: "본문 하단/끝" },
    { value: "sidebar", label: "사이드바" },
  ],
};

const DEFAULT_PLACEMENT = { app: "head", vnkorlife: "top", chaovietnam: "in-content" };
const SURFACE_LABEL = Object.fromEntries(SURFACES.map((s) => [s.key, s.label]));

// 지면·위치별 권장 이미지 크기(px). 안 맞아도 표시 시 자동으로 슬롯에 맞춰짐(잘림 없이 축소/여백).
// 웹과 앱 규격이 다르므로 분리. key = `${surface}:${position|slot}`.
const SIZE_GUIDE = {
  "app:head": "1080 × 300",
  "app:inner": "1080 × 450",
  "app:bottom": "1080 × 150",
  "app:popup": "1080 × 1920",
  "vnkorlife:top": "1456 × 400 (가로 배너)",
  "vnkorlife:in-content": "1456 × 400 (가로 배너)",
  "vnkorlife:bottom": "1456 × 400 (가로 배너)",
  "vnkorlife:sidebar": "600 × 500 (정사각형에 가까움)",
  "chaovietnam:top": "970 × 250 또는 728 × 90 (가로 배너)",
  "chaovietnam:in-content": "970 × 250 또는 728 × 90 (가로 배너)",
  "chaovietnam:bottom": "970 × 250 또는 728 × 90 (가로 배너)",
  "chaovietnam:sidebar": "300 × 600 또는 300 × 250 (세로 배너)",
};
const sizeGuide = (surface, placement) => SIZE_GUIDE[`${surface}:${placement}`] || "자유 크기";

// 지면별 노출 페이지(타겟팅). 아무것도 선택 안 하면 그 지면의 '모든 페이지'에 노출.
// 앱/vnkorlife = 실제 화면별. chaovietnam(뉴스 사이트) = 홈/뉴스터미날/상세.
const APP_PAGES = [
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
// vnkorlife = 실제 페이지값(AdBanner의 page prop과 일치). 뉴스터미날은 chaovietnam 몫이라 없음.
const VNKORLIFE_PAGES = [
  { value: "home", label: "🏠 홈페이지" },
  { value: "blog", label: "📝 블로그 글" },
  { value: "market", label: "🥕 당근/나눔 목록" },
  { value: "market-detail", label: "🥕 당근/나눔 상세" },
  { value: "realestate", label: "🏢 부동산 목록" },
  { value: "realestate-detail", label: "🏢 부동산 상세" },
  { value: "jobs", label: "💼 구인구직 목록" },
  { value: "jobs-detail", label: "💼 구인구직 상세" },
];
const CHAOVIETNAM_PAGES = [
  { value: "home", label: "🏠 홈페이지" },
  { value: "news-terminal", label: "📰 뉴스 터미날" },
  { value: "detail", label: "📄 상세페이지 (컨텐츠·뉴스 상세)" },
];
const SURFACE_PAGES = { app: APP_PAGES, vnkorlife: VNKORLIFE_PAGES, chaovietnam: CHAOVIETNAM_PAGES };
const pageLabel = (surface, value) =>
  (SURFACE_PAGES[surface]?.find((p) => p.value === value)?.label || value).replace(/^[^\s]+\s/, "");

const todayStr = () => new Date().toISOString().slice(0, 10);

function isActiveNow(ad) {
  const t = todayStr();
  return ad.isActive && ad.startDate <= t && ad.endDate >= t;
}

// advertiserName → slug (advertiserId 자동 생성용)
function slugify(name) {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const emptyForm = () => ({
  advertiserName: "",
  advertiserId: "",
  title: "",
  type: "image",
  images: [],
  linkUrl: "",
  surfaces: ["app", "vnkorlife", "chaovietnam"], // 기본: 묶어 노출
  placements: {
    app: { position: "head", targetPages: [] },
    vnkorlife: { position: "top", targetPages: [] },
    chaovietnam: { position: "in-content", targetPages: [] },
  },
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
export default function AdCenterPage() {
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
      const snap = await getDocs(query(collection(db, COLLECTION), orderBy("createdAt", "desc")));
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
    await updateDoc(doc(db, COLLECTION, ad.id), { isActive: !ad.isActive, updatedAt: serverTimestamp() });
    setAds((prev) => prev.map((a) => (a.id === ad.id ? { ...a, isActive: !a.isActive } : a)));
    notify(`"${ad.title}" ${!ad.isActive ? "활성화" : "비활성화"} 완료`);
  };

  const deleteAd = async (ad) => {
    if (!confirm(`"${ad.title}" 광고를 삭제하시겠습니까?`)) return;
    await Promise.allSettled(
      (ad.images || []).map((url) => deleteObject(ref(storage, url)).catch(() => {}))
    );
    await deleteDoc(doc(db, COLLECTION, ad.id));
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
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-7 rounded-xl border-2 border-gray-300 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-extrabold text-slate-900">🎯 통합 광고센터</h1>
          <p className="text-base text-slate-700 font-semibold">앱 · vnkorlife · chaovietnam 한 곳에서</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {actionMsg && <span className="rounded-lg bg-green-100 px-4 py-2.5 text-base font-bold text-green-800 border-2 border-green-300">✅ {actionMsg}</span>}
          {errorMsg && <span className="rounded-lg bg-red-100 px-4 py-2.5 text-base font-bold text-red-800 border-2 border-red-300">❌ {errorMsg}</span>}
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="rounded-xl bg-indigo-600 px-6 py-3 text-base font-bold text-white hover:bg-indigo-700 shadow-sm transition-colors"
          >
            + 새 광고 등록
          </button>
        </div>
      </div>

      {/* 안내 배너 */}
      <div className="rounded-xl bg-amber-50 border-2 border-amber-200 px-5 py-3 text-sm text-amber-900 font-medium leading-relaxed">
        💡 여기서 등록한 광고는 <b>선택한 지면(앱/vnkorlife/chaovietnam)에 함께</b> 노출됩니다.
        기존 <b>「앱 광고 관리」</b>(앱 전용)와는 별개이며, 통합 노출은 지면 연결 작업(Phase 2·3) 완료 후 실제 표시됩니다.
      </div>

      {/* 폼 및 리스트 */}
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
          <div className="grid gap-5 mt-7">
            {!showForm && ads.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-slate-400 py-20 text-center text-lg text-slate-700 bg-white font-semibold leading-relaxed">
                아직 등록된 통합 광고가 없습니다.<br />우측 상단의 버튼을 눌러 추가해보세요.
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
  const surfaces = ad.surfaces || [];

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
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {ad.advertiserName && (
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-bold text-white">🏷 {ad.advertiserName}</span>
          )}
          <p className="truncate text-lg font-bold text-slate-900">{ad.title}</p>
          <span className={`rounded-full px-3 py-1 text-sm font-bold border-2 ${
            active ? "bg-green-100 text-green-800 border-green-300"
            : ad.isActive ? "bg-amber-100 text-amber-800 border-amber-300"
            : "bg-gray-200 text-gray-800 border-gray-400"
          }`}>
            {active ? "ON" : ad.isActive ? "기간 외" : "OFF"}
          </span>
          <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-bold text-purple-800 border-2 border-purple-300">
            우선도 {ad.priority || 10}
          </span>
        </div>

        {/* 노출 지면 뱃지 */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-sm font-bold text-slate-900">📢 노출:</span>
          {surfaces.length > 0 ? surfaces.map((s) => {
            const pl = ad.placements?.[s] || {};
            const pos = pl.position || pl.slot;
            const pages = (pl.targetPages || []);
            const pagesText = pages.length > 0 ? pages.map((p) => pageLabel(s, p)).join("·") : "전체";
            return (
              <span key={s} className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800 border border-blue-300">
                {SURFACE_LABEL[s] || s}{pos ? ` · ${pos}` : ""} · 📄{pagesText}
              </span>
            );
          }) : <span className="text-xs text-slate-500">선택된 지면 없음</span>}
        </div>

        <div className="text-base text-slate-800 space-y-1 font-medium">
          <p className="truncate">🔗 {ad.linkUrl}</p>
          <p>📅 {ad.startDate} ~ {ad.endDate}</p>
        </div>
      </div>

      {/* 성과 지표 */}
      <div className="flex flex-row sm:flex-col gap-4 sm:gap-2 px-5 py-4 sm:py-0 bg-slate-50 sm:bg-transparent rounded-lg border-2 border-slate-200 sm:border-0 justify-center">
        <div className="flex justify-between sm:justify-start items-center gap-3">
          <span className="text-sm text-slate-700 font-bold w-14">조회수</span>
          <span className="text-lg font-bold text-slate-900">{(ad.impressions || 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between sm:justify-start items-center gap-3">
          <span className="text-sm text-slate-700 font-bold w-14">클릭수</span>
          <span className="text-lg font-bold text-indigo-700">{(ad.clicks || 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between sm:justify-start items-center gap-3">
          <span className="text-sm text-slate-700 font-bold w-14">전환율</span>
          <span className="text-base font-bold text-teal-700">
            {ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : "0.00"}%
          </span>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-row sm:flex-col shrink-0 items-center gap-2 justify-end sm:border-l-2 sm:border-slate-200 sm:pl-4">
        <button onClick={onToggle}
          className={`flex-1 sm:flex-none w-full rounded-lg px-4 py-2.5 text-base font-bold transition-colors shadow-sm border-2 ${
            ad.isActive ? "bg-amber-100 text-amber-900 hover:bg-amber-200 border-amber-300" : "bg-green-100 text-green-900 hover:bg-green-200 border-green-300"
          }`}>
          {ad.isActive ? "⏸ 비활성화" : "▶ 활성화"}
        </button>
        <button onClick={onEdit}
          className="flex-1 sm:flex-none w-full rounded-lg bg-gray-200 px-4 py-2.5 text-base font-bold text-gray-900 hover:bg-gray-300 transition-colors shadow-sm border-2 border-gray-300">
          ✏️ 수정
        </button>
        <button onClick={onDelete}
          className="flex-1 sm:flex-none w-full rounded-lg bg-red-100 px-4 py-2.5 text-base font-bold text-red-800 hover:bg-red-200 transition-colors shadow-sm border-2 border-red-300">
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
    advertiserName: initial.advertiserName || "",
    advertiserId: initial.advertiserId || "",
    title: initial.title || "",
    type: initial.type || "image",
    images: initial.images || [],
    linkUrl: initial.linkUrl || "",
    surfaces: initial.surfaces || [],
    placements: {
      app: { position: initial.placements?.app?.position || "head", targetPages: initial.placements?.app?.targetPages || [] },
      vnkorlife: { position: initial.placements?.vnkorlife?.position || "top", targetPages: initial.placements?.vnkorlife?.targetPages || [] },
      chaovietnam: { position: initial.placements?.chaovietnam?.position || "in-content", targetPages: initial.placements?.chaovietnam?.targetPages || [] },
    },
    startDate: initial.startDate,
    endDate: initial.endDate,
    isActive: initial.isActive,
    priority: initial.priority || 10,
    impressions: initial.impressions || 0,
    clicks: initial.clicks || 0,
  } : emptyForm());

  const [existingImages, setExistingImages] = useState(initial?.images || []);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const fileRef = useRef(null);
  const advertiserRef = useRef(null);
  const titleRef = useRef(null);
  const linkUrlRef = useRef(null);
  const uploadRef = useRef(null);
  const surfacesRef = useRef(null);
  const endDateRef = useRef(null);

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      if (key === "advertiserName") delete next.advertiserName;
      if (key === "title") delete next.title;
      if (key === "linkUrl") delete next.linkUrl;
      if (key === "surfaces") delete next.surfaces;
      if (key === "startDate" || key === "endDate") delete next.endDate;
      return next;
    });
  };

  const toggleSurface = (key) => {
    set(
      "surfaces",
      form.surfaces.includes(key) ? form.surfaces.filter((x) => x !== key) : [...form.surfaces, key]
    );
  };

  const setPlacement = (surface, value) => {
    setForm((prev) => ({
      ...prev,
      placements: {
        ...prev.placements,
        [surface]: { ...prev.placements[surface], position: value },
      },
    }));
  };

  const toggleTargetPage = (surface, page) => {
    setForm((prev) => {
      const cur = prev.placements[surface]?.targetPages || [];
      const nextPages = cur.includes(page) ? cur.filter((p) => p !== page) : [...cur, page];
      return { ...prev, placements: { ...prev.placements, [surface]: { ...prev.placements[surface], targetPages: nextPages } } };
    });
  };

  const onFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setFieldErrors((prev) => {
      if (!prev.images) return prev;
      const next = { ...prev };
      delete next.images;
      return next;
    });
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
    const path = `ads_unified/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
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
    const errors = {};
    if (!form.advertiserName.trim()) errors.advertiserName = "광고주 이름을 입력해주세요.";
    if (!form.title.trim()) errors.title = "캠페인 제목을 입력해주세요.";
    if (!form.linkUrl.trim()) errors.linkUrl = "클릭 이동 URL을 입력해주세요.";
    if (form.surfaces.length === 0) errors.surfaces = "노출할 지면을 최소 1개 선택해주세요.";
    if (existingImages.length === 0 && pendingFiles.length === 0) errors.images = "이미지 또는 동영상을 업로드해주세요.";
    if (form.startDate > form.endDate) errors.endDate = "종료일이 시작일보다 빠릅니다.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const order = ["advertiserName", "title", "linkUrl", "surfaces", "images", "endDate"];
      const firstKey = order.find((k) => errors[k]);
      const refMap = {
        advertiserName: advertiserRef,
        title: titleRef,
        linkUrl: linkUrlRef,
        surfaces: surfacesRef,
        images: uploadRef,
        endDate: endDateRef,
      };
      const target = refMap[firstKey]?.current;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
          setTimeout(() => target.focus({ preventScroll: true }), 300);
        }
      }
      onError(errors[firstKey]);
      return;
    }

    setFieldErrors({});
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

      // 선택된 지면만 placements에 남긴다 (깔끔한 저장)
      const cleanPlacements = {};
      for (const s of form.surfaces) {
        const targetPages = form.placements[s]?.targetPages || [];
        cleanPlacements[s] = { position: form.placements[s]?.position || DEFAULT_PLACEMENT[s], targetPages };
      }

      const advertiserId = form.advertiserId?.trim() || slugify(form.advertiserName);

      const payload = {
        advertiserName: form.advertiserName.trim(),
        advertiserId,
        title: form.title.trim(),
        type: form.type,
        images: finalImages,
        linkUrl: form.linkUrl.trim(),
        surfaces: form.surfaces,
        placements: cleanPlacements,
        startDate: form.startDate,
        endDate: form.endDate,
        isActive: form.isActive,
        priority: form.priority,
        impressions: form.impressions || 0,
        clicks: form.clicks || 0,
        updatedAt: serverTimestamp(),
      };

      if (initial) {
        await updateDoc(doc(db, COLLECTION, initial.id), payload);
        onSaved({ ...initial, ...payload, updatedAt: undefined }, false);
      } else {
        const docRef = await addDoc(collection(db, COLLECTION), { ...payload, createdAt: serverTimestamp() });
        onSaved({ id: docRef.id, ...payload, updatedAt: undefined }, true);
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
        {initial ? "✏️ 통합 광고 수정" : "🎯 신규 통합 광고 등록"}
      </h2>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* 광고주 이름 */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">광고주 이름 <span className="text-red-500">*</span></label>
          <input ref={advertiserRef} type="text" value={form.advertiserName} onChange={(e) => set("advertiserName", e.target.value)}
            placeholder="예: 코리안에어 / 신한은행 베트남"
            className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 transition-all ${
              fieldErrors.advertiserName ? "border-red-500 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
            }`} />
          {fieldErrors.advertiserName && <p className="mt-1.5 text-xs font-semibold text-red-600">⚠ {fieldErrors.advertiserName}</p>}
          <p className="mt-1.5 text-xs text-slate-500 ml-1">※ 리포트가 이 이름 기준으로 3개 지면 노출을 합산합니다.</p>
        </div>

        {/* 캠페인 제목 */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">캠페인 제목 <span className="text-red-500">*</span></label>
          <input ref={titleRef} type="text" value={form.title} onChange={(e) => set("title", e.target.value)}
            placeholder="예: 8월 항공권 이벤트 배너"
            className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 transition-all ${
              fieldErrors.title ? "border-red-500 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
            }`} />
          {fieldErrors.title && <p className="mt-1.5 text-xs font-semibold text-red-600">⚠ {fieldErrors.title}</p>}
        </div>

        {/* 노출 지면 선택 (핵심) */}
        <div ref={surfacesRef} className="sm:col-span-2 p-4 bg-indigo-50/50 rounded-xl border-2 border-indigo-100">
          <label className="mb-3 block text-sm font-bold text-slate-700">
            노출 지면 선택 <span className="text-red-500">*</span>
            <span className="font-normal text-slate-500 text-xs ml-2">(이 광고를 어디에 띄울지 — 여러 곳 동시 가능)</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {SURFACES.map((s) => {
              const on = form.surfaces.includes(s.key);
              return (
                <div key={s.key} className={`rounded-xl border-2 p-3 transition-all ${on ? "border-indigo-500 bg-white shadow-sm" : "border-slate-200 bg-white/60"}`}>
                  <button type="button" onClick={() => toggleSurface(s.key)}
                    className="flex items-center gap-2 w-full text-left">
                    <span className={`flex h-5 w-5 items-center justify-center rounded border-2 text-xs font-bold ${on ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                    <span className="text-sm font-bold text-slate-800">{s.label}</span>
                  </button>
                  {on && (
                    <div className="mt-2.5 space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">노출 위치</label>
                        <select
                          value={form.placements[s.key]?.position || DEFAULT_PLACEMENT[s.key]}
                          onChange={(e) => setPlacement(s.key, e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
                          {PLACEMENTS[s.key].map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                        <p className="mt-1 text-[11px] font-bold text-indigo-600">
                          📐 권장 {sizeGuide(s.key, form.placements[s.key]?.position || DEFAULT_PLACEMENT[s.key])} px
                        </p>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          노출 페이지 <span className="font-normal text-slate-400">(안 고르면 전체)</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {SURFACE_PAGES[s.key].map((p) => {
                            const sel = (form.placements[s.key]?.targetPages || []).includes(p.value);
                            return (
                              <button key={p.value} type="button" onClick={() => toggleTargetPage(s.key, p.value)}
                                className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-all ${
                                  sel ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                                }`}>
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {fieldErrors.surfaces && <p className="mt-2 text-xs font-semibold text-red-600">⚠ {fieldErrors.surfaces}</p>}
        </div>

        {/* 우선순위 */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">우선순위 (낮을수록 선노출)</label>
          <input type="number" min={1} max={99} value={form.priority} onChange={(e) => set("priority", Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
        </div>

        {/* 링크 URL */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">클릭 이동 URL <span className="text-red-500">*</span></label>
          <input ref={linkUrlRef} type="url" value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)}
            placeholder="https://example.com"
            className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 transition-all ${
              fieldErrors.linkUrl ? "border-red-500 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
            }`} />
          {fieldErrors.linkUrl && <p className="mt-1.5 text-xs font-semibold text-red-600">⚠ {fieldErrors.linkUrl}</p>}
        </div>

        {/* 시작일 / 종료일 */}
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">노출 시작일</label>
          <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-bold text-slate-700">노출 종료일</label>
          <input ref={endDateRef} type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)}
            className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 transition-all ${
              fieldErrors.endDate ? "border-red-500 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
            }`} />
          {fieldErrors.endDate && <p className="mt-1.5 text-xs font-semibold text-red-600">⚠ {fieldErrors.endDate}</p>}
        </div>

        {/* 업로드 영역 */}
        <div className="sm:col-span-2 mt-2">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="block text-sm font-bold text-slate-700">배너/영상 업로드 <span className="text-red-500">*</span></label>
              <p className="text-[11px] text-slate-500 mt-0.5">위 지면별 권장 크기(📐)에 맞추면 가장 선명합니다. 크기가 달라도 <b>잘리지 않고 자동으로 슬롯에 맞춰 표시</b>됩니다.</p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              {(["image", "video"]).map((t) => (
                <button key={t} type="button" onClick={() => changeType(t)}
                  className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${form.type === t ? "bg-white shadow-sm text-slate-800" : "text-slate-500"}`}>
                  {t === "image" ? "이미지 (다중가능)" : "영상 (mp4 단일)"}
                </button>
              ))}
            </div>
          </div>

          <div ref={uploadRef} className={`p-4 border-2 border-dashed rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors ${fieldErrors.images ? "border-red-500 bg-red-50/40" : "border-slate-300"}`}>
            <div className="flex flex-wrap gap-4 items-center">
              {existingImages.map((url) => (
                <div key={url} className="relative h-[120px] w-[200px] overflow-hidden rounded-xl bg-slate-200 border border-slate-300 shadow-sm">
                  {form.type === "video" ? <video src={url} className="h-full w-full object-cover" muted /> : <Image src={url} alt="" fill className="object-cover" sizes="200px" />}
                  <button onClick={() => removeExisting(url)} className="absolute right-1.5 top-1.5 rounded-full bg-red-500/90 h-6 w-6 flex items-center justify-center text-white text-xs hover:bg-red-600 shadow-sm">✕</button>
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">기존 자산</span>
                </div>
              ))}
              {pendingFiles.map((item, idx) => (
                <div key={idx} className="relative h-[120px] w-[200px] overflow-hidden rounded-xl bg-slate-200 border border-blue-300 shadow-sm">
                  {form.type === "video" ? <video src={item.preview} className="h-full w-full object-cover" muted /> : <Image src={item.preview} alt="" fill className="object-cover" sizes="200px" unoptimized />}
                  <button onClick={() => removePending(idx)} className="absolute right-1.5 top-1.5 rounded-full bg-red-500/90 h-6 w-6 flex items-center justify-center text-white text-xs hover:bg-red-600 shadow-sm">✕</button>
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
            <input ref={fileRef} type="file" accept={form.type === "image" ? "image/*" : "video/mp4"} multiple={form.type === "image"} className="hidden" onChange={onFileChange} />
            {uploading && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-indigo-500 transition-all duration-300 ease-out shadow-sm" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="mt-1.5 text-xs font-bold text-indigo-600 text-center">업로드 중... {uploadProgress}%</p>
              </div>
            )}
          </div>
          {fieldErrors.images && <p className="mt-1.5 text-xs font-semibold text-red-600">⚠ {fieldErrors.images}</p>}
        </div>

        {/* 활성화 토글 */}
        <div className="sm:col-span-2 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">광고 활성화 상태</span>
              <span className="text-xs text-slate-500">비활성화 시 어느 지면에도 노출되지 않습니다. 조회/클릭 카운트는 보존됩니다.</span>
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
        <button onClick={onCancel} className="rounded-xl border border-slate-300 px-6 py-2.5 text-sm font-bold text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-colors">
          취소하기
        </button>
        <button onClick={handleSave} disabled={saving}
          className="rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
          {saving ? "저장 중..." : initial ? "수정사항 저장" : "통합 광고 등록"}
        </button>
      </div>
    </div>
  );
}
