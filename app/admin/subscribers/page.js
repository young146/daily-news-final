'use client';

import { useState, useEffect } from 'react';
import { Mail, Plus, Trash2, CheckCircle2, XCircle, Download } from 'lucide-react';

export default function SubscribersPage() {
    const [subscribers, setSubscribers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState('');
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        fetchSubscribers();
    }, []);

    const fetchSubscribers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/subscribers');
            if (res.ok) {
                const data = await res.json();
                setSubscribers(data);
            }
        } catch (error) {
            console.error('Failed to fetch subscribers:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportToCSV = () => {
        const headers = ['이메일', '상태', '구독 일시'];
        const rows = subscribers.map(s => [
            s.email,
            s.isActive ? '활성' : '취소됨',
            new Date(s.createdAt).toLocaleString('ko-KR')
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        // UTF-8 BOM helps Excel recognize the encoding
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `subscribers_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
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

            if (res.ok) {
                setNewEmail('');
                fetchSubscribers();
                alert(data.message);
            } else {
                alert(data.message || '추가 실패');
            }
        } catch (error) {
            console.error('Failed to add subscriber:', error);
            alert('오류가 발생했습니다.');
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (email) => {
        if (!confirm(`정말 ${email} 구독자를 삭제하시겠습니까?`)) return;

        try {
            const res = await fetch(`/api/admin/subscribers?email=${encodeURIComponent(email)}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setSubscribers(subscribers.filter(s => s.email !== email));
            } else {
                alert('삭제에 실패했습니다.');
            }
        } catch (error) {
            console.error('Failed to delete subscriber:', error);
        }
    };

    if (loading) {
        return <div className="flex justify-center p-8">로딩 중...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Mail className="mr-2" /> 이메일 구독자 관리
                </h1>
                <div className="flex items-center space-x-3">
                    <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                        총 {subscribers.length}명
                    </span>
                    <button
                        onClick={exportToCSV}
                        className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 transition flex items-center text-sm font-medium shadow-sm hover:shadow"
                    >
                        <Download size={16} className="mr-1" /> 엑셀 다운로드
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold mb-4">새 구독자 직접 추가</h2>
                <form onSubmit={handleAddSubscriber} className="flex gap-4 max-w-md">
                    <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="이메일 주소 입력"
                        required
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                        type="submit"
                        disabled={adding}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition flex items-center whitespace-nowrap disabled:opacity-50"
                    >
                        {adding ? '추가 중...' : <><Plus size={18} className="mr-1" /> 추가</>}
                    </button>
                </form>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">구독 일시</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {subscribers.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                                    등록된 이메일 구독자가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            subscribers.map((subscriber) => (
                                <tr key={subscriber.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                        {subscriber.email}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {subscriber.isActive ? (
                                            <span className="flex items-center text-green-600 text-sm font-medium">
                                                <CheckCircle2 size={16} className="mr-1" /> 활성
                                            </span>
                                        ) : (
                                            <span className="flex items-center text-red-500 text-sm font-medium">
                                                <XCircle size={16} className="mr-1" /> 취소됨
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-sm">
                                        {new Date(subscriber.createdAt).toLocaleDateString('ko-KR', {
                                            year: 'numeric', month: 'long', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleDelete(subscriber.email)}
                                            className="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-md transition"
                                            title="삭제"
                                        >
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
    );
}
