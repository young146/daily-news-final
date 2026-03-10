'use client';

import { useState, useEffect } from 'react';
import { Mail, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

export default function EmailLogsPage() {
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchLogs(page); }, [page]);

    const fetchLogs = async (p = 1) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/email-logs?page=${p}&limit=20`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
                setTotal(data.total);
                setTotalPages(data.totalPages);
            }
        } catch (err) {
            console.error('로그 조회 실패:', err);
        } finally {
            setLoading(false);
        }
    };

    const methodBadge = (method) => {
        if (method === 'smtp') return (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">SMTP</span>
        );
        return (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-bold">Resend</span>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-2">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Mail className="mr-2" /> 이메일 발송 기록
                </h1>
                <div className="flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                        총 {total}건
                    </span>
                    <button onClick={() => fetchLogs(page)}
                        className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-sm transition">
                        <RefreshCw size={14} /> 새로고침
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="py-16 text-center text-gray-500">로딩 중...</div>
                ) : logs.length === 0 ? (
                    <div className="py-16 text-center text-gray-500">
                        <Mail size={40} className="mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">발송 기록이 없습니다.</p>
                        <p className="text-sm mt-1 text-gray-400">뉴스레터가 발송되면 여기에 기록됩니다.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">발송 일시</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일 제목</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">방식</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">총 발송</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">성공</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">실패</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">배치 수</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">비고</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                            {new Date(log.sentAt).toLocaleString('ko-KR', {
                                                year: 'numeric', month: '2-digit', day: '2-digit',
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">{log.subject}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">{methodBadge(log.method)}</td>
                                        <td className="px-4 py-3 text-center text-sm font-semibold text-gray-700">{log.total.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="flex items-center justify-center gap-1 text-green-600 font-semibold text-sm">
                                                <CheckCircle2 size={14} /> {log.succeeded.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {log.failed > 0 ? (
                                                <span className="flex items-center justify-center gap-1 text-red-500 font-semibold text-sm">
                                                    <XCircle size={14} /> {log.failed.toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 text-sm">0</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-500">{log.batches}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{log.note || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 text-sm">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                        className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">◀ 이전</button>
                    <span className="text-gray-600">{page} / {totalPages} 페이지</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                        className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">다음 ▶</button>
                </div>
            )}
        </div>
    );
}
