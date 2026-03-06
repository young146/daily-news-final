'use client';

import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, CheckCircle2, XCircle, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SubscribersPage() {
    const [subscribers, setSubscribers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState('');
    const [adding, setAdding] = useState(false);
    const [importing, setImporting] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => { fetchSubscribers(); }, []);

    const fetchSubscribers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/subscribers');
            if (res.ok) setSubscribers(await res.json());
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
            if (res.ok) { setNewEmail(''); fetchSubscribers(); alert(data.message); }
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
            fetchSubscribers();
        } catch { alert('삭제 중 오류가 발생했습니다.'); }
        finally { setBulkDeleting(false); }
    };

    const handleCleanup = async () => {
        if (!confirm('유효하지 않은 이메일(깨진 데이터)을 모두 삭제합니다. 계속하시겠습니까?')) return;
        setCleaning(true);
        try {
            const res = await fetch('/api/admin/subscribers', { method: 'PATCH' });
            const data = await res.json();
            alert(data.message);
            fetchSubscribers();
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

    if (loading) return <div className="flex justify-center p-8">로딩 중...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Mail className="mr-2" /> 이메일 구독자 관리
                </h1>
                <div className="flex items-center flex-wrap gap-2">
                    <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                        총 {subscribers.length}명
                    </span>
                    {selected.size > 0 && (
                        <button onClick={handleBulkDelete} disabled={bulkDeleting}
                            className="bg-red-600 text-white px-3 py-1.5 rounded-md hover:bg-red-700 transition flex items-center text-sm font-medium shadow-sm disabled:opacity-50">
                            <Trash2 size={16} className="mr-1" />
                            {bulkDeleting ? '삭제 중...' : `선택 삭제 (${selected.size}명)`}
                        </button>
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
                                            {s.isActive ? (
                                                <span className="flex items-center text-green-600 text-sm font-medium">
                                                    <CheckCircle2 size={16} className="mr-1" /> 활성
                                                </span>
                                            ) : (
                                                <span className="flex items-center text-red-500 text-sm font-medium">
                                                    <XCircle size={16} className="mr-1" /> 취소됨
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-sm">
                                            {new Date(s.createdAt).toLocaleDateString('ko-KR', {
                                                year: 'numeric', month: 'long', day: 'numeric',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right">
                                            <button onClick={() => handleDelete(s.email)}
                                                className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-md transition" title="삭제">
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
