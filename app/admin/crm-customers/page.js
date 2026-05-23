'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Download, Search, ExternalLink, UserPlus } from 'lucide-react';

// 직원 CRM 통합 시트 (xinchao_crm 과 동일 소스)
const SHEET_ID = '1Iue5sV2PE3c6rqLuVozrp14JiKciGyKvbP8bJheqWlA';
const CUSTOMER_TAB = '고객DB';
const CONSULT_TAB = '상담이력';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuote) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') { inQuote = false; }
            else { cell += ch; }
        } else {
            if (ch === '"') inQuote = true;
            else if (ch === ',') { row.push(cell); cell = ''; }
            else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
            else if (ch === '\r') { /* skip */ }
            else { cell += ch; }
        }
    }
    if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
    return rows;
}

async function fetchTab(tabName) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}&v=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${tabName} 탭 로드 실패 (HTTP ${res.status})`);
    const text = await res.text();
    if (text.includes('google.visualization') || text.includes('<!DOCTYPE')) {
        throw new Error(`${tabName} 탭: gviz 오류 응답`);
    }
    return parseCSV(text);
}

export default function CrmCustomersPage() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [lastFetchedAt, setLastFetchedAt] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [customerRows, consultRows] = await Promise.all([
                fetchTab(CUSTOMER_TAB),
                fetchTab(CONSULT_TAB),
            ]);

            // 고객DB: 1행 예시("86DH Vina") + 2행 헤더("고객사") 제외
            //   컬럼: 0=고객사, 1=담당자, 2=직책, 3=연락처, 4=이메일, 5=주소, 6=AREA, 7=CITY, 9=현재상태
            const customerData = customerRows.filter(
                (r) => r[0] && r[0].trim() && r[0].trim() !== '고객사' && r[0].trim() !== '86DH Vina'
            );

            // 상담이력: 1행 헤더 제외, 고객사(col 2) 있는 행만
            //   컬럼: 2=고객사, 3=담당자, 5=연락처, 6=이메일, 13=Status
            const consultData = consultRows.slice(1).filter((r) => r[2] && r[2].trim());

            const byEmail = new Map();
            const add = (rawEmail, customer, contact, phone, status, source) => {
                const e = (rawEmail || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
                if (!EMAIL_RE.test(e)) return;
                if (byEmail.has(e)) {
                    const existing = byEmail.get(e);
                    if (!existing.sources.includes(source)) existing.sources.push(source);
                    // 첫 등장 데이터 유지
                    return;
                }
                byEmail.set(e, {
                    email: e,
                    customer: (customer || '').trim(),
                    contact: (contact || '').trim(),
                    phone: (phone || '').trim(),
                    status: (status || '').trim(),
                    sources: [source],
                });
            };

            for (const r of customerData) {
                add(r[4], r[0], r[1], r[3], r[9], '고객DB');
            }
            for (const r of consultData) {
                add(r[6], r[2], r[3], r[5], r[13], '상담이력');
            }

            const list = Array.from(byEmail.values()).sort((a, b) =>
                a.customer.localeCompare(b.customer, 'ko')
            );
            setEntries(list);
            setLastFetchedAt(new Date());
        } catch (e) {
            console.error('[crm-customers] fetch 실패:', e);
            setError(e.message || String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = entries.filter((e) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase().trim();
        return (
            e.email.includes(q) ||
            e.customer.toLowerCase().includes(q) ||
            e.contact.toLowerCase().includes(q)
        );
    });

    const handleDownload = () => {
        const today = new Date().toISOString().slice(0, 10);
        const header = ['이메일', '고객사', '담당자', '연락처', '현재상태', '출처'];
        const csvCell = (v) => {
            const s = String(v ?? '');
            return /[,"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const lines = [header.join(',')];
        for (const e of filtered) {
            lines.push([e.email, e.customer, e.contact, e.phone, e.status, e.sources.join('+')].map(csvCell).join(','));
        }
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crm_customers_${today}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleRegisterAsCustomers = async () => {
        if (entries.length === 0) return;
        const ok = window.confirm(
            `현재 시트의 ${entries.length}개 이메일을 "CRM 거래 고객"으로 발송 DB에 등록합니다.\n\n` +
            `• 신규 이메일 → 발송 DB에 추가 (isCustomer=true)\n` +
            `• 기존 일반 구독자 → 고객으로 승격 (isCustomer=true)\n` +
            `• 이미 고객인 이메일 → 회사/이름/전화만 갱신\n\n` +
            `데일리 뉴스는 전체 발송, 자체 홍보 카드는 고객만 발송하는 기준이 됩니다.\n계속할까요?`
        );
        if (!ok) return;
        setSyncing(true);
        setSyncResult(null);
        try {
            const payload = {
                defaultIsCustomer: true,
                subscribers: entries.map((e) => ({
                    email: e.email,
                    name: e.contact || undefined,
                    company: e.customer || undefined,
                    phone: e.phone || undefined,
                    isCustomer: true,
                })),
            };
            const res = await fetch('/api/admin/subscribers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
            setSyncResult({ ok: true, ...data });
        } catch (e) {
            setSyncResult({ ok: false, message: e.message || String(e) });
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-7 flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <Users className="text-slate-800" size={36} />
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">CRM 고객 명단</h1>
                        <p className="text-base text-gray-700 mt-2 font-medium leading-relaxed">
                            직원 CRM 시트(고객DB + 상담이력)에서 실시간으로 불러옵니다. 시트가 변경되면 새로고침 시 즉시 반영됩니다.
                        </p>
                    </div>
                </div>
                <a
                    href={SHEET_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-base text-blue-700 font-bold hover:underline flex items-center gap-1.5 px-4 py-2 bg-blue-50 rounded-lg border-2 border-blue-200"
                >
                    원본 시트 열기 <ExternalLink size={18} />
                </a>
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-300 p-5 mb-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-grow min-w-[280px]">
                        <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                        <input
                            type="text"
                            placeholder="이메일·고객사·담당자 검색"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 border-2 border-gray-400 rounded-lg text-base font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-600"
                        />
                    </div>
                    <button
                        onClick={load}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg text-base font-bold disabled:opacity-50 border-2 border-gray-300"
                    >
                        <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                        새로고침
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={loading || filtered.length === 0}
                        className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-bold disabled:opacity-50 shadow-sm"
                    >
                        <Download size={20} />
                        CSV 다운로드 ({filtered.length})
                    </button>
                    <button
                        onClick={handleRegisterAsCustomers}
                        disabled={loading || syncing || entries.length === 0}
                        className="flex items-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-base font-bold disabled:opacity-50 shadow-sm"
                        title="시트 전체를 발송 DB에 'CRM 고객'으로 등록/승격"
                    >
                        <UserPlus size={20} />
                        {syncing ? '등록 중…' : `고객으로 등록 (${entries.length})`}
                    </button>
                </div>

                <div className="mt-4 text-base text-gray-700 flex flex-wrap gap-5 font-semibold">
                    <span>총 고유 이메일: <strong className="text-gray-900 text-lg">{entries.length}</strong></span>
                    <span>표시: <strong className="text-gray-900 text-lg">{filtered.length}</strong></span>
                    {lastFetchedAt && (
                        <span>마지막 갱신: {lastFetchedAt.toLocaleString('ko-KR')}</span>
                    )}
                </div>
            </div>

            {syncResult && (
                <div className={`mb-5 p-4 rounded-xl text-base font-bold border-2 ${syncResult.ok ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-red-50 text-red-900 border-red-300'}`}>
                    {syncResult.ok
                        ? `발송 DB 동기화 완료 — 신규 ${syncResult.added ?? 0} · 고객 승격 ${syncResult.promotedToCustomer ?? 0} · 업데이트 ${syncResult.updated ?? 0} · 스킵 ${syncResult.skipped ?? 0}`
                        : `발송 DB 동기화 실패: ${syncResult.message}`}
                </div>
            )}

            {error && (
                <div className="mb-5 p-4 rounded-xl bg-red-50 text-red-900 border-2 border-red-300 text-base font-bold">
                    시트 로드 실패: {error}
                </div>
            )}

            <div className="bg-white rounded-xl border-2 border-gray-300 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-base">
                        <thead className="bg-gray-100 text-gray-900 border-b-2 border-gray-300">
                            <tr>
                                <th className="text-left px-5 py-4 font-bold text-base">이메일</th>
                                <th className="text-left px-5 py-4 font-bold text-base">고객사</th>
                                <th className="text-left px-5 py-4 font-bold text-base">담당자</th>
                                <th className="text-left px-5 py-4 font-bold text-base">연락처</th>
                                <th className="text-left px-5 py-4 font-bold text-base">현재상태</th>
                                <th className="text-left px-5 py-4 font-bold text-base">출처</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan={6} className="px-5 py-10 text-center text-lg text-gray-700 font-semibold">불러오는 중…</td></tr>
                            )}
                            {!loading && filtered.length === 0 && (
                                <tr><td colSpan={6} className="px-5 py-10 text-center text-lg text-gray-700 font-semibold">데이터가 없습니다.</td></tr>
                            )}
                            {!loading && filtered.map((e) => (
                                <tr key={e.email} className="border-b-2 border-gray-100 hover:bg-gray-50">
                                    <td className="px-5 py-3 font-mono text-base text-gray-900 font-semibold">{e.email}</td>
                                    <td className="px-5 py-3 text-gray-900 text-base font-bold">{e.customer}</td>
                                    <td className="px-5 py-3 text-gray-800 text-base font-medium">{e.contact}</td>
                                    <td className="px-5 py-3 text-gray-800 text-base font-medium">{e.phone}</td>
                                    <td className="px-5 py-3 text-gray-800 text-base font-medium">{e.status}</td>
                                    <td className="px-5 py-3 text-base text-gray-700 font-semibold">{e.sources.join(' + ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
