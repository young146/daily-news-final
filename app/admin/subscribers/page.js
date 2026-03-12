'use client';

import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, CheckCircle2, XCircle, Download, Upload, Edit } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SubscribersPage() {
    const [subscribers, setSubscribers] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState('');;
    const [adding, setAdding] = useState(false);
    const [importing, setImporting] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [editingSubscriber, setEditingSubscriber] = useState(null);
    const [editForm, setEditForm] = useState({ email: '', name: '', company: '', phone: '' });

    useEffect(() => { fetchSubscribers(page, search, statusFilter); }, [page, search, statusFilter]);

    const fetchSubscribers = async (p = 1, q = '', s = 'all') => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/subscribers?page=${p}&limit=100&search=${encodeURIComponent(q)}&status=${s}`);
            if (res.ok) {
                const data = await res.json();
                setSubscribers(data.subscribers);
                setTotal(data.total);
                setTotalPages(data.totalPages);
            }
        } catch (error) {
            console.error('Failed to fetch subscribers:', error);
        } finally {
            setLoading(false);
            setSelected(new Set());
        }
    };


    const exportToCSV = () => {
        const headers = ['회사명', '이메일', '이름', '전화번호', '상태', '구독 일시'];
        const rows = subscribers.map(s => [
            s.company || '', s.email, s.name || '', s.phone || '',
            s.isActive ? '활성' : '취소됨',
            new Date(s.createdAt).toLocaleString('ko-KR')
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `subscribers_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                // 헤더 행 건너뜀
                // 엑셀 구조: A=회사명(0), B=이메일(1), C=이름(2), D=메일형식(3), E=대표전화(4)
                const items = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    let email = '', company = '', name = '', phone = '';

                    // 모든 열에서 이메일 찾기
                    for (let j = 0; j < row.length; j++) {
                        const val = String(row[j] || '').trim();
                        if (!email && val.includes('@') && val.includes('.') && val.indexOf('@') > 0) {
                            email = val;
                            // 이메일 바로 앞 열 = 회사명 (j==1이면 row[0])
                            if (j > 0) company = String(row[j - 1] || '').trim();
                            // 이메일 바로 다음 열 = 이름
                            name = String(row[j + 1] || '').trim();
                            // 전화번호: 이메일 이후 열에서 숫자 패턴 찾기
                            for (let k = j + 2; k < Math.min(j + 5, row.length); k++) {
                                const pVal = String(row[k] || '').trim();
                                if (/^[\d\s\-\+\(\)]+$/.test(pVal) && pVal.replace(/\D/g, '').length >= 7) {
                                    phone = pVal;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                    if (email) items.push({ email, company, name, phone });
                }

                if (items.length === 0) {
                    alert('파일에서 유효한 이메일 주소를 찾을 수 없습니다.');
                    return;
                }

                if (!confirm(`총 ${items.length}개의 이메일을 가져옵니다. 계속하시겠습니까?`)) return;

                setImporting(true);
                const res = await fetch('/api/admin/subscribers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subscribers: items }),
                });
                const result = await res.json();
                setImporting(false);
                alert(result.message);
                fetchSubscribers();
            } catch (err) {
                setImporting(false);
                alert('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleAddSubscriber = async (e) => {
        e.preventDefault();
        if (!newEmail || !newEmail.includes('@')) {
            alert('유효한 이메일 주소를 입력해주세요.');
            return;
        }
        setAdding(true);
        try {
            const res = await fetch('/api/admin/subscribers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newEmail }),
            });
            const data = await res.json();
            if (res.ok) { setNewEmail(''); fetchSubscribers(page, search, statusFilter); alert(data.message); }
            else alert(data.message || '추가 실패');
        } catch { alert('오류가 발생했습니다.'); }
        finally { setAdding(false); }
    };

    const handleDelete = async (email) => {
        if (!confirm(`정말 ${email} 구독자를 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch(`/api/admin/subscribers?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
            if (res.ok) setSubscribers(subscribers.filter(s => s.email !== email));
            else alert('삭제에 실패했습니다.');
        } catch (error) { console.error(error); }
    };

    const handleBulkDelete = async () => {
        if (selected.size === 0) return;
        if (!confirm(`선택된 ${selected.size}명을 삭제하시겠습니까?`)) return;
        setBulkDeleting(true);
        try {
            const res = await fetch('/api/admin/subscribers', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selected) }),
            });
            const data = await res.json();
            alert(data.message);
            fetchSubscribers(page, search, statusFilter);
        } catch { alert('삭제 중 오류가 발생했습니다.'); }
        finally { setBulkDeleting(false); }
    };

    const handleToggleActive = async (id, currentStatus) => {
        setToggling(true);
        try {
            const res = await fetch('/api/admin/subscribers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isActive: !currentStatus }),
            });
            const data = await res.json();
            if (res.ok) {
                // Optimistically update UI
                setSubscribers(subscribers.map(s => s.id === id ? { ...s, isActive: !currentStatus } : s));
            } else {
                alert(data.message || '상태 변경에 실패했습니다.');
            }
        } catch { alert('서버 오류가 발생했습니다.'); }
        finally { setToggling(false); }
    };

    const handleBulkToggleActive = async (isActive) => {
        if (selected.size === 0) return;
        const actionText = isActive ? '활성화' : '비활성화';
        if (!confirm(`선택된 ${selected.size}명의 이메일을 일괄 ${actionText} 하시겠습니까?`)) return;

        setToggling(true);
        try {
            const res = await fetch('/api/admin/subscribers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selected), isActive }),
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                fetchSubscribers(page, search, statusFilter); // Refresh list
                setSelected(new Set()); // Deselect all on success
            } else {
                alert(data.message || '상태 변경에 실패했습니다.');
            }
        } catch { alert('서버 오류가 발생했습니다.'); }
        finally { setToggling(false); }
    };

    const handleCleanup = async () => {
        if (!confirm('유효하지 않은 이메일(깨진 데이터)을 모두 삭제합니다. 계속하시겠습니까?')) return;
        setCleaning(true);
        try {
            const res = await fetch('/api/admin/subscribers', { method: 'PATCH' });
            const data = await res.json();
            alert(data.message);
            fetchSubscribers(page, search, statusFilter);
        } catch { alert('정리 중 오류가 발생했습니다.'); }
        finally { setCleaning(false); }
    };

    const toggleSelect = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === subscribers.length) setSelected(new Set());
        else setSelected(new Set(subscribers.map(s => s.id)));
    };

    const handleSearch = (e) => {
        e.preventDefault();
        setSearch(searchInput);
        setPage(1);
    };

    const handleEditClick = (subscriber) => {
        setEditingSubscriber(subscriber.id);
        setEditForm({
            email: subscriber.email || '',
            name: subscriber.name || '',
            company: subscriber.company || '',
            phone: subscriber.phone || ''
        });
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (!editForm.email || !editForm.email.includes('@')) {
            alert('유효한 이메일 주소를 입력해주세요.');
            return;
        }

        try {
            const res = await fetch('/api/admin/subscribers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingSubscriber,
                    ...editForm
                }),
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message);
                setEditingSubscriber(null);
                fetchSubscribers(page, search, statusFilter);
            } else {
                alert(data.message || '수정에 실패했습니다.');
            }
        } catch { alert('서버 오류가 발생했습니다.'); }
    };

    if (loading) return <div className="flex justify-center p-8">로딩 중...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Mail className="mr-2" /> 이메일 구독자 관리
                </h1>
                <div className="flex items-center flex-wrap gap-2">
                    <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                        총 {total}명 (이 페이지: {subscribers.length}명)
                    </span>
                    {selected.size > 0 && (
                        <div className="flex items-center gap-2 border-r pr-2 mr-1">
                            <span className="text-sm text-gray-500 font-medium">{selected.size}명 선택됨:</span>
                            <button onClick={() => handleBulkToggleActive(true)} disabled={toggling}
                                className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 transition flex items-center text-sm font-medium shadow-sm disabled:opacity-50">
                                <CheckCircle2 size={16} className="mr-1" />
                                활성화
                            </button>
                            <button onClick={() => handleBulkToggleActive(false)} disabled={toggling}
                                className="bg-yellow-600 text-white px-3 py-1.5 rounded-md hover:bg-yellow-700 transition flex items-center text-sm font-medium shadow-sm disabled:opacity-50">
                                <XCircle size={16} className="mr-1" />
                                비활성화
                            </button>
                            <button onClick={handleBulkDelete} disabled={bulkDeleting}
                                className="bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 transition flex items-center text-sm font-medium shadow-sm disabled:opacity-50">
                                <Trash2 size={16} className="mr-1" />
                                삭제
                            </button>
                        </div>
                    )}
                    <button onClick={handleCleanup} disabled={cleaning}
                        className={`px-3 py-1.5 rounded-md transition flex items-center text-sm font-medium shadow-sm text-white ${cleaning ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-600 hover:bg-gray-700'}`}>
                        <Trash2 size={16} className="mr-1" />
                        {cleaning ? '정리 중...' : '깨진 데이터 정리'}
                    </button>
                    <label className={`px-3 py-1.5 rounded-md transition flex items-center text-sm font-medium shadow-sm cursor-pointer text-white ${importing ? 'bg-orange-300 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}>
                        <Upload size={16} className="mr-1" />
                        {importing ? '가져오는 중...' : '엑셀 가져오기'}
                        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing} className="hidden" />
                    </label>
                    <button onClick={exportToCSV}
                        className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 transition flex items-center text-sm font-medium shadow-sm">
                        <Download size={16} className="mr-1" /> 엑셀 다운로드
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold mb-4">새 구독자 직접 추가</h2>
                <form onSubmit={handleAddSubscriber} className="flex gap-4 max-w-md">
                    <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="이메일 주소 입력" required
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                    <button type="submit" disabled={adding}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition flex items-center whitespace-nowrap disabled:opacity-50">
                        {adding ? '추가 중...' : <><Plus size={18} className="mr-1" /> 추가</>}
                    </button>
                </form>
            </div>

            {/* 검색 필터 영역 */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <form onSubmit={handleSearch} className="flex gap-2 items-center">
                    <select
                        value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                        <option value="all">모든 상태</option>
                        <option value="active">활성 (ON)</option>
                        <option value="inactive">비활성 (OFF)</option>
                    </select>
                    <input
                        type="text" value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        placeholder="이메일/이름/회사 검색"
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 w-56" />
                    <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700">검색</button>
                    {(search || statusFilter !== 'all') && <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setStatusFilter('all'); setPage(1); }} className="text-gray-500 text-sm hover:underline">초기화</button>}
                </form>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left w-10">
                                    <input type="checkbox"
                                        checked={subscribers.length > 0 && selected.size === subscribers.length}
                                        onChange={toggleSelectAll}
                                        className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">회사명</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">구독 일시</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">관리</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {subscribers.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                                        등록된 이메일 구독자가 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                subscribers.map((s) => (
                                    <tr key={s.id} className={`hover:bg-gray-50 ${selected.has(s.id) ? 'bg-blue-50' : ''}`}>
                                        <td className="px-4 py-3">
                                            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)}
                                                className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 text-sm">{s.company || '-'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900 text-sm">{s.email}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 text-sm">{s.name || '-'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 text-sm">{s.phone || '-'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <button
                                                onClick={() => handleToggleActive(s.id, s.isActive)}
                                                disabled={toggling}
                                                className={`flex items-center text-sm font-medium px-2 py-1 rounded transition disabled:opacity-50 ${s.isActive
                                                    ? 'text-green-700 bg-green-50 hover:bg-green-100'
                                                    : 'text-red-700 bg-red-50 hover:bg-red-100'
                                                    }`}
                                                title="클릭하여 상태 변경"
                                            >
                                                {s.isActive ? (
                                                    <><CheckCircle2 size={16} className="mr-1" /> 활성 (ON)</>
                                                ) : (
                                                    <><XCircle size={16} className="mr-1" /> 비활성 (OFF)</>
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-sm">
                                            {new Date(s.createdAt).toLocaleDateString('ko-KR', {
                                                year: 'numeric', month: 'long', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleEditClick(s)}
                                                    className="text-blue-500 hover:text-blue-700 bg-blue-50 p-2 rounded-md transition" title="수정">
                                                    <Edit size={18} />
                                                </button>
                                                <button onClick={() => handleDelete(s.email)}
                                                    className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-md transition" title="삭제">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 페이지네이션 (하단 배치) */}
            <div className="flex justify-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 text-sm">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                        className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">◀ 이전</button>
                    <span className="text-gray-600">{page} / {totalPages} 페이지</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                        className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">다음 ▶</button>
                </div>
            </div>

            {/* 수정 모달 */}
            {editingSubscriber && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">구독자 정보 수정</h2>
                        <form onSubmit={handleEditSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
                                <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">회사명</label>
                                <input type="text" value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                                <input type="text" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button type="button" onClick={() => setEditingSubscriber(null)}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">취소</button>
                                <button type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">저장</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
