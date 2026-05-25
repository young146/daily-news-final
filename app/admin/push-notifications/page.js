'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, Send, RefreshCw, CheckCircle2, XCircle, Clock, Eye, Link, Image, Upload, X, MessageSquare, ChevronRight, Calendar, FileText, Trash2, Edit2 } from 'lucide-react';

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
    const [url, setUrl] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dryRun, setDryRun] = useState(false);
    const [sending, setSending] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sendResult, setSendResult] = useState(null);
    const [editingDraftId, setEditingDraftId] = useState(null);
    const fileInputRef = useRef(null);

    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);
    const [drafts, setDrafts] = useState([]);
    const [draftsLoading, setDraftsLoading] = useState(true);

    const [commentsModal, setCommentsModal] = useState(null);
    const [commentsLoading, setCommentsLoading] = useState(false);

    useEffect(() => { fetchLogs(); fetchDrafts(); }, []);

    const fetchLogs = async () => {
        setLogsLoading(true);
        try {
            const res = await fetch('/api/admin/push');
            if (res.ok) setLogs((await res.json()).logs || []);
        } catch (e) { console.error(e); }
        finally { setLogsLoading(false); }
    };

    const fetchDrafts = async () => {
        setDraftsLoading(true);
        try {
            const res = await fetch('/api/admin/push/drafts');
            if (res.ok) setDrafts((await res.json()).drafts || []);
        } catch (e) { console.error(e); }
        finally { setDraftsLoading(false); }
    };

    const openComments = async (log) => {
        if (!log.announcementId) return;
        setCommentsLoading(true);
        setCommentsModal({ log, comments: [] });
        try {
            const res = await fetch(`/api/admin/push?announcementId=${log.announcementId}`);
            if (res.ok) {
                const data = await res.json();
                setCommentsModal({ log, comments: data.comments || [] });
            }
        } catch (e) { console.error(e); }
        finally { setCommentsLoading(false); }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다.'); return; }
        if (file.size > 5 * 1024 * 1024) { alert('5MB 이하 이미지만 업로드 가능합니다.'); return; }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/admin/push/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok && data.url) setImageUrl(data.url);
            else alert(data.error || '업로드 실패');
        } catch (e) { alert('업로드 중 오류: ' + e.message); }
        finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const resetForm = () => {
        setTitle(''); setBody(''); setUrl(''); setImageUrl(''); setScheduledAt('');
        setEditingDraftId(null); setSendResult(null);
    };

    const loadDraftToForm = (draft) => {
        setTitle(draft.title);
        setBody(draft.body);
        setUrl(draft.url || '');
        setImageUrl(draft.imageUrl || '');
        setScheduledAt(draft.scheduledAt ? draft.scheduledAt.slice(0, 16) : '');
        setEditingDraftId(draft.id);
        setSendResult(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSave = async () => {
        if (!title.trim() || !body.trim()) return;
        setSaving(true); setSendResult(null);
        try {
            const payload = {
                title, body,
                url: url.trim() || null,
                imageUrl: imageUrl.trim() || null,
                scheduledAt: scheduledAt || null,
            };
            let res;
            if (editingDraftId) {
                res = await fetch(`/api/admin/push/drafts/${editingDraftId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch('/api/admin/push/drafts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }
            const data = await res.json();
            if (res.ok) {
                setSendResult({ ok: true, saved: true, status: data.status });
                resetForm();
                fetchDrafts();
            } else {
                setSendResult({ ok: false, error: data.error });
            }
        } catch (e) { setSendResult({ ok: false, error: e.message }); }
        finally { setSaving(false); }
    };

    const handleSend = async () => {
        if (!title.trim() || !body.trim()) return;
        const confirmed = dryRun || confirm(
            `전체 앱 사용자에게 푸시를 발송합니다.\n\n제목: ${title}\n내용: ${body}${url ? '\n링크: ' + url : ''}${imageUrl ? '\n이미지: 있음' : ''}\n\n계속하시겠습니까?`
        );
        if (!confirmed) return;
        setSending(true); setSendResult(null);
        try {
            const res = await fetch('/api/admin/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, body, url: url.trim() || null, imageUrl: imageUrl.trim() || null, dryRun }),
            });
            const data = await res.json();
            setSendResult({ ok: res.ok, ...data });
            if (res.ok && !dryRun) {
                if (editingDraftId) {
                    await fetch(`/api/admin/push/drafts/${editingDraftId}`, { method: 'DELETE' });
                }
                resetForm();
                setTimeout(() => { fetchLogs(); fetchDrafts(); }, 1500);
            }
        } catch (e) { setSendResult({ ok: false, error: e.message }); }
        finally { setSending(false); }
    };

    const handleSendDraft = async (draft) => {
        if (!confirm(`"${draft.title}"\n\n지금 즉시 전체 발송하시겠습니까?`)) return;
        try {
            const res = await fetch(`/api/admin/push/drafts/${draft.id}/send`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(`발송 완료 — FCM ${data.fcmCount || 0}명 + Expo ${data.expoCount || 0}명`);
                fetchDrafts(); fetchLogs();
            } else {
                alert('발송 실패: ' + (data.error || '알 수 없는 오류'));
            }
        } catch (e) { alert('오류: ' + e.message); }
    };

    const handleDeleteDraft = async (draft) => {
        if (!confirm(`"${draft.title}" 임시저장을 삭제하시겠습니까?`)) return;
        try {
            await fetch(`/api/admin/push/drafts/${draft.id}`, { method: 'DELETE' });
            fetchDrafts();
        } catch (e) { alert('삭제 실패: ' + e.message); }
    };

    const fmtTime = (iso) => iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Ho_Chi_Minh', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

    const buildCommentTree = (comments) => {
        const roots = comments.filter(c => !c.parentId);
        const replies = comments.filter(c => !!c.parentId);
        const result = [];
        roots.forEach(root => {
            result.push({ ...root, depth: 0 });
            replies.filter(r => r.parentId === root.id).forEach(r => result.push({ ...r, depth: 1 }));
        });
        return result;
    };

    const isScheduled = !!scheduledAt;

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">푸시 알림 관리</h1>
                <p className="text-sm text-gray-500 mt-1">특별 이벤트·공지를 전체 앱 사용자에게 발송합니다.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* 작성 폼 */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                            <Bell size={18} className="text-orange-500" />
                            {editingDraftId ? '임시저장 수정' : '새 알림 작성'}
                        </h2>
                        {editingDraftId && (
                            <button onClick={resetForm} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                                <X size={13} />새로 작성
                            </button>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">제목 <span className="text-gray-400 font-normal">({title.length}/50)</span></label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value.slice(0, 50))} placeholder="예: 🎉 씬짜오 창립 기념 이벤트" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">내용 <span className="text-gray-400 font-normal">({body.length}/150)</span></label>
                        <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 150))} placeholder="예: 오늘 하루 앱에서 특별 혜택을 확인하세요!" rows={3} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Link size={14} className="text-gray-400" />링크 <span className="text-gray-400 font-normal">(선택)</span></label>
                        <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://chaovietnam.co.kr/..." className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Image size={14} className="text-gray-400" />이미지 <span className="text-gray-400 font-normal">(선택 · Android 즉시 / iOS 차기 빌드)</span></label>
                        {imageUrl ? (
                            <div className="relative">
                                <img src={imageUrl} alt="" className="w-full h-32 object-cover rounded-lg border border-gray-200" onError={() => setImageUrl('')} />
                                <button onClick={() => setImageUrl('')} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow border border-gray-200 hover:bg-red-50"><X size={14} className="text-gray-500" /></button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-4 py-3 w-full text-sm text-gray-500 hover:border-orange-400 hover:text-orange-500 transition-colors">
                                    {uploading ? <><RefreshCw size={14} className="animate-spin" />업로드 중…</> : <><Upload size={14} />이미지 업로드 (5MB 이하)</>}
                                </button>
                                <input type="file" ref={fileInputRef} accept="image/*" onChange={handleImageUpload} className="hidden" />
                                <div className="flex items-center gap-2"><div className="flex-1 h-px bg-gray-200" /><span className="text-xs text-gray-400">또는 URL 직접 입력</span><div className="flex-1 h-px bg-gray-200" /></div>
                                <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                            </div>
                        )}
                    </div>

                    {/* 예약 발송 시각 */}
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                            <Calendar size={14} className="text-gray-400" />예약 발송 시각
                            <span className="text-gray-400 font-normal">(선택 · 비우면 즉시 발송)</span>
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={e => setScheduledAt(e.target.value)}
                            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        {scheduledAt && (
                            <p className="text-xs text-blue-500 flex items-center gap-1">
                                <Clock size={11} />베트남 현지 시각 기준 · 5분 내외 오차 가능
                            </p>
                        )}
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                        <span className="text-sm text-gray-600">테스트 모드 <span className="text-gray-400">(실제 발송 없이 대상 토큰 수만 확인)</span></span>
                    </label>

                    {/* 버튼 행 */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            disabled={saving || !title.trim() || !body.trim()}
                            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg transition-colors text-sm"
                        >
                            {saving ? <RefreshCw size={15} className="animate-spin" /> : <FileText size={15} />}
                            {isScheduled ? '예약 등록' : '임시저장'}
                        </button>
                        {!isScheduled && (
                            <button
                                onClick={handleSend}
                                disabled={sending || !title.trim() || !body.trim()}
                                className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                            >
                                {sending ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                                {dryRun ? '테스트 실행' : '지금 발송'}
                            </button>
                        )}
                    </div>

                    {sendResult && (
                        <div className={`rounded-lg p-4 text-sm ${sendResult.ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                            {sendResult.ok ? (
                                sendResult.saved ? (
                                    <p>{sendResult.status === 'scheduled' ? '⏰ 예약 등록 완료' : '📝 임시저장 완료'}</p>
                                ) : sendResult.dryRun ? (
                                    <p>테스트 완료 — FCM <b>{sendResult.fcmCount}</b>개, Expo <b>{sendResult.expoCount}</b>개 토큰 확인됨</p>
                                ) : (
                                    <p>발송 완료 — FCM <b>{sendResult.fcmCount}</b>명 + Expo <b>{sendResult.expoCount}</b>명 · 공지ID: <code className="text-xs bg-green-100 px-1 rounded">{sendResult.announcementId}</code></p>
                                )
                            ) : <p>오류: {sendResult.error}</p>}
                        </div>
                    )}
                </div>

                {/* 폰 미리보기 */}
                <div className="flex flex-col items-center justify-start pt-4">
                    <p className="text-xs text-gray-400 mb-3 flex items-center gap-1"><Eye size={13} />알림 미리보기</p>
                    <div className="w-72 bg-gray-900 rounded-3xl p-3 shadow-2xl">
                        <div className="bg-gray-800 rounded-2xl overflow-hidden">
                            <div className="flex justify-between px-4 pt-2 pb-1 text-white text-xs"><span>9:41</span><span>●●●</span></div>
                            <div className="mx-2 mb-2 bg-white rounded-xl overflow-hidden shadow">
                                {imageUrl && <img src={imageUrl} alt="" className="w-full h-24 object-cover" />}
                                <div className="p-3 flex items-start gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">씬</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-900 truncate">{title || '제목을 입력하세요'}</p>
                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{body || '내용을 입력하세요'}</p>
                                        {url && <p className="text-xs text-blue-400 mt-1 truncate">🔗 {url}</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {scheduledAt && (
                        <div className="mt-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-1.5">
                            <Clock size={12} />예약: {new Date(scheduledAt).toLocaleString('ko-KR')}
                        </div>
                    )}
                    <p className="text-xs text-gray-400 mt-3 text-center">이미지: Android 즉시 · iOS 차기 빌드 후</p>
                    <p className="text-xs text-blue-400 mt-1 text-center">💬 탭하면 댓글 대화창 열림</p>
                </div>
            </div>

            {/* 임시저장 / 예약 발송 목록 */}
            <div className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                        <FileText size={16} className="text-gray-500" />
                        임시저장 / 예약 발송
                        {drafts.length > 0 && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{drafts.length}</span>}
                    </h2>
                    <button onClick={fetchDrafts} disabled={draftsLoading} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                        <RefreshCw size={14} className={draftsLoading ? 'animate-spin' : ''} />새로고침
                    </button>
                </div>
                {draftsLoading ? (
                    <div className="py-8 text-center text-gray-400 text-sm">불러오는 중…</div>
                ) : drafts.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">임시저장된 항목이 없습니다.</div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {drafts.map(draft => (
                            <div key={draft.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${draft.status === 'scheduled' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                            {draft.status === 'scheduled' ? '⏰ 예약' : '📝 임시저장'}
                                        </span>
                                        {draft.status === 'scheduled' && draft.scheduledAt && (
                                            <span className="text-xs text-blue-600 flex items-center gap-1">
                                                <Clock size={11} />{fmtTime(draft.scheduledAt)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800 truncate">{draft.title}</p>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">{draft.body}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        {draft.imageUrl && <span className="text-xs text-gray-400 flex items-center gap-1"><Image size={11} />이미지</span>}
                                        {draft.url && <span className="text-xs text-gray-400 flex items-center gap-1"><Link size={11} />링크</span>}
                                        <span className="text-xs text-gray-400">{fmtTime(draft.createdAt)} 저장</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => loadDraftToForm(draft)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="수정">
                                        <Edit2 size={15} />
                                    </button>
                                    <button onClick={() => handleSendDraft(draft)} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="지금 발송">
                                        <Send size={15} />
                                    </button>
                                    <button onClick={() => handleDeleteDraft(draft)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="삭제">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 발송 이력 */}
            <div className="bg-white rounded-xl border border-gray-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-base font-semibold text-gray-800">발송 이력</h2>
                    <button onClick={fetchLogs} disabled={logsLoading} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                        <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />새로고침
                    </button>
                </div>
                {logsLoading ? <div className="py-12 text-center text-gray-400 text-sm">불러오는 중…</div>
                    : logs.length === 0 ? <div className="py-12 text-center text-gray-400 text-sm">발송 이력이 없습니다.</div>
                        : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 border-b border-gray-100">
                                            <th className="text-left px-6 py-3 font-medium">종류</th>
                                            <th className="text-left px-6 py-3 font-medium">제목</th>
                                            <th className="text-left px-6 py-3 font-medium">내용</th>
                                            <th className="text-left px-6 py-3 font-medium">첨부</th>
                                            <th className="text-right px-6 py-3 font-medium">수신자</th>
                                            <th className="text-right px-6 py-3 font-medium">댓글</th>
                                            <th className="text-right px-6 py-3 font-medium">상태</th>
                                            <th className="text-right px-6 py-3 font-medium">발송 시각</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {logs.map(log => {
                                            const typeInfo = TYPE_LABELS[log.type] || { label: log.type, color: 'bg-gray-100 text-gray-600 border-gray-200' };
                                            const statusInfo = STATUS_LABELS[log.status] || STATUS_LABELS['sent'];
                                            return (
                                                <tr key={log.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium border ${typeInfo.color}`}>{typeInfo.label}</span></td>
                                                    <td className="px-6 py-3 text-gray-800 max-w-[140px] truncate">{log.title || '-'}</td>
                                                    <td className="px-6 py-3 text-gray-500 max-w-[180px] truncate">{log.body || '-'}</td>
                                                    <td className="px-6 py-3">
                                                        <div className="flex items-center gap-2">
                                                            {log.imageUrl && <a href={log.imageUrl} target="_blank" rel="noreferrer"><Image size={14} className="text-blue-400 hover:text-blue-600" /></a>}
                                                            {log.url && <a href={log.url} target="_blank" rel="noreferrer"><Link size={14} className="text-blue-400 hover:text-blue-600" /></a>}
                                                            {!log.imageUrl && !log.url && <span className="text-gray-300">—</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-gray-700 font-medium">{log.status === 'sent' ? (log.fcmCount + log.expoCount).toLocaleString() : '-'}</td>
                                                    <td className="px-6 py-3 text-right">
                                                        {log.announcementId ? (
                                                            <button onClick={() => openComments(log)} className="flex items-center justify-end gap-1 text-orange-500 hover:text-orange-700 font-medium">
                                                                <MessageSquare size={14} />
                                                                {log.commentCount ?? 0}
                                                                <ChevronRight size={12} />
                                                            </button>
                                                        ) : <span className="text-gray-300">—</span>}
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <span className={`flex items-center justify-end gap-1 ${statusInfo.color}`}>{statusInfo.icon} {statusInfo.label}</span>
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-gray-400 text-xs whitespace-nowrap">{fmtTime(log.sentAt)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
            </div>

            {/* 댓글 모달 */}
            {commentsModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                            <div>
                                <h3 className="font-semibold text-gray-900 text-base">댓글 조회</h3>
                                <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{commentsModal.log.title}</p>
                            </div>
                            <button onClick={() => setCommentsModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-4 space-y-3">
                            {commentsLoading ? (
                                <div className="py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><RefreshCw size={14} className="animate-spin" />불러오는 중…</div>
                            ) : commentsModal.comments.length === 0 ? (
                                <div className="py-8 text-center text-gray-400 text-sm">아직 댓글이 없습니다.</div>
                            ) : (
                                buildCommentTree(commentsModal.comments).map(c => (
                                    <div key={c.id} className={`flex gap-3 ${c.depth === 1 ? 'ml-8 pl-3 border-l-2 border-orange-100' : ''}`}>
                                        <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold shrink-0">
                                            {(c.displayName || '?')[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-semibold text-gray-800">{c.displayName}</span>
                                                {c.parentDisplayName && <span className="text-xs text-gray-400">↩ {c.parentDisplayName}</span>}
                                                <span className="text-xs text-gray-400 ml-auto">{fmtTime(c.createdAt)}</span>
                                            </div>
                                            {c.text && <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>}
                                            {c.imageUrl && <img src={c.imageUrl} alt="" className="mt-2 rounded-lg max-h-40 object-cover" />}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
