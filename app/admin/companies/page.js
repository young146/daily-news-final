'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Building2, Search, RefreshCw, Plus, Upload, Edit, Trash2,
    ChevronLeft, ChevronRight, X, MapPin, Briefcase, Calendar, Globe
} from 'lucide-react';

const PER_PAGE = 25;

// ─── 통계 카드 ────────────────────────────────────────────────────────────────
function StatsCards({ stats, loading }) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-white rounded-xl border-2 border-gray-300 p-5 animate-pulse h-28" />
                ))}
            </div>
        );
    }

    if (!stats) return null;

    const topArea = (stats.by_area || []).slice(0, 3);
    const topGroup = (stats.by_group || []).slice(0, 3);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border-2 border-gray-300 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                    <Building2 size={20} className="text-blue-600" />
                    <span className="text-sm font-bold text-gray-600 uppercase">총 등록 회사</span>
                </div>
                <div className="text-4xl font-bold text-gray-900">{(stats.total ?? 0).toLocaleString()}</div>
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-300 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                    <MapPin size={20} className="text-green-600" />
                    <span className="text-sm font-bold text-gray-600 uppercase">지역별 Top 3</span>
                </div>
                {topArea.length === 0 ? (
                    <div className="text-gray-400 text-sm">데이터 없음</div>
                ) : (
                    <ul className="space-y-1">
                        {topArea.map((a) => (
                            <li key={a.area} className="flex justify-between text-sm font-medium text-gray-800">
                                <span>{a.area || '기타'}</span>
                                <span className="font-bold text-gray-900">{(a.count ?? 0).toLocaleString()}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-300 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                    <Briefcase size={20} className="text-purple-600" />
                    <span className="text-sm font-bold text-gray-600 uppercase">업종별 Top 3</span>
                </div>
                {topGroup.length === 0 ? (
                    <div className="text-gray-400 text-sm">데이터 없음</div>
                ) : (
                    <ul className="space-y-1">
                        {topGroup.map((g) => (
                            <li key={g.group} className="flex justify-between text-sm font-medium text-gray-800">
                                <span className="truncate max-w-[120px]">{g.group || '기타'}</span>
                                <span className="font-bold text-gray-900">{(g.count ?? 0).toLocaleString()}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-300 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                    <Calendar size={20} className="text-amber-600" />
                    <span className="text-sm font-bold text-gray-600 uppercase">최근 7일 추가</span>
                </div>
                <div className="text-4xl font-bold text-gray-900">{(stats.recent ?? 0).toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">건</div>
            </div>
        </div>
    );
}

// ─── 편집/추가 모달 ───────────────────────────────────────────────────────────
const EMPTY_FORM = {
    company: '', director: '', industry_group: '', industry_detail: '',
    area: '', address: '', tel: '', homepage: '', email: '', source: '', source_url: '',
    description: '', products: '', employees: '', country: '', mobile: '',
    additional_emails: '', founded_year: '',
};

function CompanyModal({ mode, initial, onClose, onSaved }) {
    const [form, setForm] = useState(mode === 'edit' && initial ? { ...EMPTY_FORM, ...initial } : { ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.company.trim()) { setError('회사명은 필수입니다.'); return; }
        setSaving(true);
        setError(null);
        try {
            let res;
            if (mode === 'edit' && initial?.id) {
                res = await fetch(`/api/admin/companies/${initial.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                });
            } else {
                res = await fetch('/api/admin/companies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                });
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
            onSaved();
        } catch (err) {
            setError(err.message || '저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const fields = [
        { key: 'company', label: '회사명 *', type: 'text', required: true },
        { key: 'director', label: '대표자', type: 'text' },
        { key: 'industry_group', label: '업종 (대분류)', type: 'text' },
        { key: 'area', label: '지역', type: 'text' },
        { key: 'address', label: '주소', type: 'text' },
        { key: 'tel', label: '전화번호', type: 'text' },
        { key: 'email', label: '이메일', type: 'email' },
        { key: 'homepage', label: '홈페이지', type: 'url' },
        { key: 'source', label: '출처', type: 'text' },
        { key: 'source_url', label: '출처 URL', type: 'url' },
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b-2 border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900">
                        {mode === 'edit' ? '기업 정보 수정' : '신규 기업 추가'}
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5">
                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-50 border-2 border-red-300 text-red-800 text-sm font-semibold">{error}</div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {fields.map(({ key, label, type, required }) => (
                            <div key={key}>
                                <label className="block text-sm font-bold text-gray-700 mb-1">{label}</label>
                                <input
                                    type={type}
                                    value={form[key]}
                                    onChange={(e) => set(key, e.target.value)}
                                    required={required}
                                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-600"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="mt-4">
                        <label className="block text-sm font-bold text-gray-700 mb-1">사업내용 (industry_detail)</label>
                        <textarea
                            value={form.industry_detail}
                            onChange={(e) => set('industry_detail', e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 resize-y"
                        />
                    </div>

                    <div className="mt-4">
                        <label className="block text-sm font-bold text-gray-700 mb-1">회사 소개 (description)</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => set('description', e.target.value)}
                            rows={5}
                            placeholder="회사 소개, 설립 배경, 주요 사업 분야 등..."
                            className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 resize-y"
                        />
                    </div>

                    <div className="mt-4">
                        <label className="block text-sm font-bold text-gray-700 mb-1">주요 제품/서비스 (products)</label>
                        <textarea
                            value={form.products}
                            onChange={(e) => set('products', e.target.value)}
                            rows={4}
                            placeholder="공급 제품 및 서비스 상세..."
                            className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 resize-y"
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose}
                            className="px-5 py-2.5 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition text-sm">
                            취소
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition text-sm disabled:opacity-50 shadow-sm">
                            {saving ? '저장 중…' : '저장'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── CSV 업로드 모달 ──────────────────────────────────────────────────────────
function CsvImportModal({ onClose, onDone }) {
    const [file, setFile] = useState(null);
    const [clearExisting, setClearExisting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const dropRef = useRef(null);

    const handleDrop = (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) setFile(f);
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        setError(null);
        setResult(null);
        try {
            const fd = new FormData();
            fd.append('csv_file', file);
            if (clearExisting) fd.append('truncate', '1');

            const res = await fetch('/api/admin/companies/import', {
                method: 'POST',
                body: fd,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
            setResult(data);
            onDone();
        } catch (err) {
            setError(err.message || '업로드에 실패했습니다.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b-2 border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900">CSV 일괄 업로드</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* 드래그앤드롭 영역 */}
                    <div
                        ref={dropRef}
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition cursor-pointer"
                        onClick={() => document.getElementById('csv-file-input').click()}
                    >
                        <Upload size={36} className="mx-auto text-gray-400 mb-3" />
                        {file ? (
                            <p className="text-sm font-bold text-gray-800">{file.name}</p>
                        ) : (
                            <p className="text-sm text-gray-500">CSV 파일을 드래그하거나 클릭하여 선택</p>
                        )}
                        <input
                            id="csv-file-input"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => setFile(e.target.files[0] || null)}
                        />
                    </div>

                    {/* 기존 데이터 비우기 옵션 */}
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={clearExisting}
                            onChange={(e) => setClearExisting(e.target.checked)}
                            className="w-5 h-5 rounded border-2 border-gray-400 text-red-600 cursor-pointer"
                        />
                        <span className="text-sm font-bold text-red-700">업로드 전 기존 데이터 모두 삭제</span>
                    </label>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-50 border-2 border-red-300 text-red-800 text-sm font-semibold">{error}</div>
                    )}
                    {result && (
                        <div className="p-3 rounded-lg bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-sm font-semibold">
                            완료 — 가져옴: {result.imported ?? 0} / 건너뜀: {result.skipped ?? 0}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-2">
                        <button onClick={onClose}
                            className="px-5 py-2.5 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition text-sm">
                            닫기
                        </button>
                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition text-sm disabled:opacity-50 shadow-sm flex items-center gap-2"
                        >
                            {uploading ? (
                                <><RefreshCw size={16} className="animate-spin" /> 업로드 중…</>
                            ) : (
                                <><Upload size={16} /> 업로드</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── 삭제 확인 다이얼로그 ─────────────────────────────────────────────────────
function DeleteDialog({ company, onClose, onDeleted }) {
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState(null);

    const handleDelete = async () => {
        setDeleting(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/companies/${company.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
            onDeleted();
        } catch (err) {
            setError(err.message || '삭제에 실패했습니다.');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">기업 삭제</h2>
                <p className="text-base text-gray-700 mb-4">
                    <strong className="text-red-700">{company.company}</strong>를 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                </p>
                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 border-2 border-red-300 text-red-800 text-sm font-semibold">{error}</div>
                )}
                <div className="flex justify-end gap-3">
                    <button onClick={onClose}
                        className="px-5 py-2.5 bg-gray-100 text-gray-800 rounded-lg font-bold hover:bg-gray-200 transition text-sm">
                        취소
                    </button>
                    <button onClick={handleDelete} disabled={deleting}
                        className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition text-sm disabled:opacity-50 shadow-sm">
                        {deleting ? '삭제 중…' : '삭제'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function CompaniesPage() {
    // 목록 상태
    const [companies, setCompanies] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState(null);

    // 검색/필터/정렬
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [areaFilter, setAreaFilter] = useState('');
    const [groupFilter, setGroupFilter] = useState('');
    const [orderby, setOrderby] = useState('id');
    const [order, setOrder] = useState('desc');

    // 통계
    const [stats, setStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true);

    // 모달
    const [modal, setModal] = useState(null); // null | { type: 'add' | 'edit' | 'delete' | 'csv', data }

    // ── 통계 로드
    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            const res = await fetch('/api/admin/companies/stats');
            const data = await res.json();
            if (res.ok) setStats(data);
        } catch {
            // 통계 실패는 조용히 처리
        } finally {
            setStatsLoading(false);
        }
    }, []);

    // ── 목록 로드
    const loadCompanies = useCallback(async (p = 1, q = '', area = '', group = '', ob = 'id', ord = 'desc') => {
        setLoading(true);
        setListError(null);
        try {
            const params = new URLSearchParams({ page: String(p), per_page: String(PER_PAGE), orderby: ob, order: ord });
            if (q) params.set('q', q);
            if (area) params.set('area', area);
            if (group) params.set('group', group);

            const res = await fetch(`/api/admin/companies?${params}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
            setCompanies(data.items ?? data.data ?? []);
            setTotal(data.total ?? 0);
            setTotalPages(data.total_pages ?? 1);
        } catch (err) {
            setListError(err.message || '데이터를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    useEffect(() => {
        loadCompanies(page, search, areaFilter, groupFilter, orderby, order);
    }, [loadCompanies, page, search, areaFilter, groupFilter, orderby, order]);

    const handleSearch = (e) => {
        e.preventDefault();
        setSearch(searchInput);
        setPage(1);
    };

    const handleReset = () => {
        setSearch('');
        setSearchInput('');
        setAreaFilter('');
        setGroupFilter('');
        setOrderby('id');
        setOrder('desc');
        setPage(1);
    };

    const handleSaved = () => {
        setModal(null);
        loadCompanies(page, search, areaFilter, groupFilter, orderby, order);
        loadStats();
    };

    const handleDeleted = () => {
        setModal(null);
        loadCompanies(1, search, areaFilter, groupFilter, orderby, order);
        setPage(1);
        loadStats();
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* 헤더 */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <Building2 className="text-slate-800" size={36} />
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">기업 디렉토리</h1>
                        <p className="text-sm text-gray-600 mt-0.5">chaovietnam.co.kr WP API 연동 기업 데이터베이스</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setModal({ type: 'csv' })}
                        className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold shadow-sm transition"
                    >
                        <Upload size={18} /> CSV 일괄 업로드
                    </button>
                    <button
                        onClick={() => setModal({ type: 'add' })}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition"
                    >
                        <Plus size={18} /> 신규 추가
                    </button>
                </div>
            </div>

            {/* 통계 카드 */}
            <StatsCards stats={stats} loading={statsLoading} />

            {/* 검색/필터/정렬 바 */}
            <div className="bg-white rounded-xl border-2 border-gray-300 p-5 shadow-sm">
                <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-center">
                    <div className="relative flex-grow min-w-[220px]">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="회사명·업종·주소·대표자 검색"
                            className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-400 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-600"
                        />
                    </div>

                    <select
                        value={areaFilter}
                        onChange={(e) => { setAreaFilter(e.target.value); setPage(1); }}
                        className="px-3 py-2.5 border-2 border-gray-400 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 bg-white"
                    >
                        <option value="">전체 지역</option>
                        {(stats?.by_area || []).filter((a) => a.area).map((a) => (
                            <option key={a.area} value={a.area}>
                                {a.area} ({(a.count ?? 0).toLocaleString()})
                            </option>
                        ))}
                    </select>

                    <select
                        value={groupFilter}
                        onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}
                        className="px-3 py-2.5 border-2 border-gray-400 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-600 bg-white"
                    >
                        <option value="">전체 업종</option>
                        {(stats?.by_group || []).filter((g) => g.group).map((g) => (
                            <option key={g.group} value={g.group}>
                                {g.group} ({(g.count ?? 0).toLocaleString()})
                            </option>
                        ))}
                    </select>

                    <select
                        value={`${orderby}:${order}`}
                        onChange={(e) => {
                            const [ob, ord] = e.target.value.split(':');
                            setOrderby(ob);
                            setOrder(ord);
                            setPage(1);
                        }}
                        className="px-3 py-2.5 border-2 border-gray-400 rounded-lg text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="id:desc">최신 등록순</option>
                        <option value="id:asc">오래된 순</option>
                        <option value="company:asc">회사명 ↑</option>
                        <option value="company:desc">회사명 ↓</option>
                        <option value="area:asc">지역 ↑</option>
                    </select>

                    <button type="submit"
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition">
                        검색
                    </button>

                    {(search || areaFilter || groupFilter) && (
                        <button type="button" onClick={handleReset}
                            className="text-gray-600 text-sm font-bold hover:underline flex items-center gap-1">
                            <X size={14} /> 초기화
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => loadCompanies(page, search, areaFilter, groupFilter, orderby, order)}
                        disabled={loading}
                        className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg text-sm font-bold border-2 border-gray-300 transition disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        새로고침
                    </button>
                </form>

                <div className="mt-3 text-sm text-gray-600 font-semibold">
                    총 <strong className="text-gray-900">{total.toLocaleString()}</strong>개 · 페이지 {page} / {totalPages}
                </div>
            </div>

            {/* 오류 */}
            {listError && (
                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 text-red-800 text-sm font-bold">
                    오류: {listError}
                </div>
            )}

            {/* 테이블 */}
            <div className="bg-white rounded-xl border-2 border-gray-300 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100 border-b-2 border-gray-300 text-gray-900">
                            <tr>
                                <th className="text-left px-5 py-4 font-bold">회사명</th>
                                <th className="text-left px-5 py-4 font-bold">대표자</th>
                                <th className="text-left px-5 py-4 font-bold">업종</th>
                                <th className="text-left px-5 py-4 font-bold">지역</th>
                                <th className="text-left px-5 py-4 font-bold">연락처</th>
                                <th className="text-left px-5 py-4 font-bold">홈페이지</th>
                                <th className="text-right px-5 py-4 font-bold">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-base text-gray-500 font-semibold">
                                        <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                                        불러오는 중…
                                    </td>
                                </tr>
                            )}
                            {!loading && companies.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-base text-gray-500 font-semibold">
                                        데이터가 없습니다.
                                    </td>
                                </tr>
                            )}
                            {!loading && companies.map((c) => (
                                <tr key={c.id} className="border-b-2 border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="px-5 py-3 font-bold text-gray-900">
                                        {c.company}
                                        {c.enriched_at && <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded">보강됨</span>}
                                    </td>
                                    <td className="px-5 py-3 text-gray-700 font-medium">{c.director || '-'}</td>
                                    <td className="px-5 py-3 text-gray-700 font-medium">
                                        <div>{c.industry_group || '-'}</div>
                                        {c.industry_detail && (
                                            <div className="text-xs text-gray-500 truncate max-w-[160px]" title={c.industry_detail}>
                                                {c.industry_detail}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-gray-700 font-medium">{c.area || '-'}</td>
                                    <td className="px-5 py-3 text-gray-700 font-medium">{c.tel || '-'}</td>
                                    <td className="px-5 py-3">
                                        {c.homepage ? (
                                            <a href={c.homepage} target="_blank" rel="noreferrer"
                                                className="text-blue-600 hover:underline flex items-center gap-1 font-medium">
                                                <Globe size={14} /> 방문
                                            </a>
                                        ) : <span className="text-gray-400">-</span>}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setModal({ type: 'edit', data: c })}
                                                className="text-blue-700 hover:text-blue-900 bg-blue-50 p-2 rounded-lg border-2 border-blue-200 transition"
                                                title="수정"
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                onClick={() => setModal({ type: 'delete', data: c })}
                                                className="text-red-700 hover:text-red-900 bg-red-50 p-2 rounded-lg border-2 border-red-200 transition"
                                                title="삭제"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 페이지네이션 */}
            <div className="flex justify-center bg-white p-5 rounded-xl border-2 border-gray-300 shadow-sm">
                <div className="flex items-center gap-3 text-sm">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1 || loading}
                        className="flex items-center gap-1 px-4 py-2.5 rounded-lg border-2 border-gray-400 font-bold text-gray-800 disabled:opacity-40 hover:bg-gray-50 transition"
                    >
                        <ChevronLeft size={16} /> 이전
                    </button>
                    <span className="text-gray-900 text-base font-bold">{page} / {totalPages}</span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages || loading}
                        className="flex items-center gap-1 px-4 py-2.5 rounded-lg border-2 border-gray-400 font-bold text-gray-800 disabled:opacity-40 hover:bg-gray-50 transition"
                    >
                        다음 <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* 모달 렌더링 */}
            {modal?.type === 'add' && (
                <CompanyModal mode="add" initial={null} onClose={() => setModal(null)} onSaved={handleSaved} />
            )}
            {modal?.type === 'edit' && (
                <CompanyModal mode="edit" initial={modal.data} onClose={() => setModal(null)} onSaved={handleSaved} />
            )}
            {modal?.type === 'delete' && (
                <DeleteDialog company={modal.data} onClose={() => setModal(null)} onDeleted={handleDeleted} />
            )}
            {modal?.type === 'csv' && (
                <CsvImportModal
                    onClose={() => setModal(null)}
                    onDone={() => {
                        setModal(null);
                        loadCompanies(1, search, areaFilter, groupFilter, orderby, order);
                        setPage(1);
                        loadStats();
                    }}
                />
            )}
        </div>
    );
}
