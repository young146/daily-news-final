'use client';

import { useState, useEffect } from 'react';
import { Bell, Send, RefreshCw, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react';

const TYPE_LABELS = {
    custom_push: { label: '커스텀', color: 'bg-purple-100 text-purple-800 border-purple-300' },
    daily_new_items_push: { label: '새 등록 (자동)', color: 'bg-blue-100 text-blue-800 border-blue-300' },
    daily_news_push: { label: '뉴스 (자동)', color: 'bg-green-100 text-green-800 border-green-300' },
};

const STATUS_LABELS = {
    sent: { icon: <CheckCircle2 size={14} />, label: '발송', color: 'text-green-600' },
    skipped_no_content: { icon: <Clock size={14} />, label: '콘텐츠 없음', color: 'text-gray-400' },
    skipped_sunday: { icon: <Clock size={14} />, label: '일요일 스킵', color: 'text-gray-400' },
    skipped_wp_fail: { icon: <XCircle size={14} />, label: 'WP 오류', color: 'text-red-500' },
    skipped_no_news: { icon: <Clock size={14} />, label: '뉴스 없음', color: 'text-gray-400' },
};

export default function PushNotificationsPage() {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [dryRun, setDryRun] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState(null);

    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);

    useEffect(() => { fetchLogs(); }, []);

    const fetchLogs = async () => {
        setLogsLoading(true);
        try {
            const res = await fetch('/api/admin/push');
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs || []);
            }
        } catch (e) {
            console.error('로그 조회 실패:', e);
        } finally {
            setLogsLoading(false);
        }
    };

    const handleSend = async () => {
        if (!title.trim() || !body.trim()) return;
        const confirmed = dryRun || confirm(
            `전체 앱 사용자에게 푸시를 발송합니다.\n\n제목: ${title}\n내용: ${body}\n\n계속하시겠습니까?`
        );
        if (!confirmed) return;

        setSending(true);
        setSendResult(null);
        try {
            const res = await fetch('/api/admin/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, body, dryRun }),
            });
            const data = await res.json();
            setSendResult({ ok: res.ok, ...data });
            if (res.ok && !dryRun) {
                setTitle('');
                setBody('');
                setTimeout(fetchLogs, 1500);
            }
        } catch (e) {
            setSendResult({ ok: false, error: e.message });
        } finally {
            setSending(false);
        }
    };

    const totalRecipients = (r) => (r.fcmCount || 0) + (r.expoCount || 0);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">푸시 알림 관리</h1>
                <p className="text-sm text-gray-500 mt-1">특별 이벤트·공지를 전체 앱 사용자에게 발송합니다.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* 작성 폼 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                    <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                        <Bell size={18} className="text-orange-500" />
                        새 알림 작성
                    </h2>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            제목 <span className="text-gray-400 font-normal">({title.length}/50)</span>
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value.slice(0, 50))}
                            placeholder="예: 🎉 씬짜오 창립 기념 이벤트"
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            내용 <span className="text-gray-400 font-normal">({body.length}/150)</span>
                        </label>
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value.slice(0, 150))}
                            placeholder="예: 오늘 하루 앱에서 특별 혜택을 확인하세요!"
                            rows={3}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={dryRun}
                            onChange={e => setDryRun(e.target.checked)}
                            className="w-4 h-4 accent-orange-500"
                        />
                        <span className="text-sm text-gray-600">
                            테스트 모드 <span className="text-gray-400">(실제 발송 없이 대상 토큰 수만 확인)</span>
                        </span>
                    </label>

                    <button
                        onClick={handleSend}
                        disabled={sending || !title.trim() || !body.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
                    >
                        {sending
                            ? <><RefreshCw size={16} className="animate-spin" /> 발송 중…</>
                            : <><Send size={16} /> {dryRun ? '테스트 실행' : '전체 발송'}</>
                        }
                    </button>

                    {sendResult && (
                        <div className={`rounded-lg p-4 text-sm ${sendResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                            {sendResult.ok ? (
                                sendResult.dryRun ? (
                                    <p>테스트 완료 — FCM <b>{sendResult.fcmCount}</b>개, Expo <b>{sendResult.expoCount}</b>개 토큰 확인됨 (실제 발송 안 함)</p>
                                ) : sendResult.skipped ? (
                                    <p>발송 스킵됨: {sendResult.error || '콘텐츠 없음'}</p>
                                ) : (
                                    <p>발송 완료 — FCM <b>{sendResult.fcmCount}</b>명 + Expo <b>{sendResult.expoCount}</b>명</p>
                                )
                            ) : (
                                <p>오류: {sendResult.error}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* 폰 미리보기 */}
                <div className="flex flex-col items-center justify-center">
                    <p className="text-xs text-gray-400 mb-3 flex items-center gap-1"><Eye size={13} /> 알림 미리보기</p>
                    <div className="w-72 bg-gray-900 rounded-3xl p-3 shadow-2xl">
                        <div className="bg-gray-800 rounded-2xl overflow-hidden">
                            {/* 상태바 */}
                            <div className="flex justify-between px-4 pt-2 pb-1 text-white text-xs">
                                <span>9:41</span>
                                <span>●●●</span>
                            </div>
                            {/* 알림 카드 */}
                            <div className="mx-2 mb-2 bg-white rounded-xl p-3 shadow">
                                <div className="flex items-start gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">씬</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-900 truncate">
                                            {title || '제목을 입력하세요'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                            {body || '내용을 입력하세요'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 발송 이력 */}
            <div className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-base font-semibold text-gray-800">발송 이력</h2>
                    <button
                        onClick={fetchLogs}
                        disabled={logsLoading}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                    >
                        <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />
                        새로고침
                    </button>
                </div>

                {logsLoading ? (
                    <div className="py-12 text-center text-gray-400 text-sm">불러오는 중…</div>
                ) : logs.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 text-sm">발송 이력이 없습니다.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 border-b border-gray-100">
                                    <th className="text-left px-6 py-3 font-medium">종류</th>
                                    <th className="text-left px-6 py-3 font-medium">제목</th>
                                    <th className="text-left px-6 py-3 font-medium">내용</th>
                                    <th className="text-right px-6 py-3 font-medium">수신자</th>
                                    <th className="text-right px-6 py-3 font-medium">상태</th>
                                    <th className="text-right px-6 py-3 font-medium">발송 시각</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {logs.map(log => {
                                    const typeInfo = TYPE_LABELS[log.type] || { label: log.type, color: 'bg-gray-100 text-gray-600 border-gray-200' };
                                    const statusInfo = STATUS_LABELS[log.status] || STATUS_LABELS['sent'];
                                    const sentAt = log.sentAt ? new Date(log.sentAt) : null;
                                    return (
                                        <tr key={log.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${typeInfo.color}`}>
                                                    {typeInfo.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-gray-800 max-w-[160px] truncate">{log.title || '-'}</td>
                                            <td className="px-6 py-3 text-gray-500 max-w-[200px] truncate">{log.body || '-'}</td>
                                            <td className="px-6 py-3 text-right text-gray-700 font-medium">
                                                {log.status === 'sent' ? totalRecipients(log).toLocaleString() : '-'}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                <span className={`flex items-center justify-end gap-1 ${statusInfo.color}`}>
                                                    {statusInfo.icon} {statusInfo.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                                                {sentAt ? sentAt.toLocaleString('ko-KR', { timeZone: 'Asia/Ho_Chi_Minh', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
