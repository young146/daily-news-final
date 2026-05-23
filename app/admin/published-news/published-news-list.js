'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { Trash2, ExternalLink, CheckCircle, XCircle, AlertCircle, Send } from 'lucide-react';
import { deletePublishedNewsAction, batchDeletePublishedNewsAction } from '../actions';

const categoryLabels = {
  'Economy': '경제',
  'Society': '사회',
  'Politics': '정치',
  'Culture': '문화',
  'International': '국제',
  'Korea-Vietnam': '한-베',
  'Community': '커뮤니티',
  'Travel': '여행',
  'Health': '건강',
  'Food': '음식',
  'Other': '기타'
};

export default function PublishedNewsList({ groupedNews, categories, subscriberCount = 0, fbReadyNews = [] }) {
  const [newsData, setNewsData] = useState(groupedNews);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isPending, startTransition] = useTransition();
  const [previewHtml, setPreviewHtml] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isTestSending, setIsTestSending] = useState(false);
  const [isAllSending, setIsAllSending] = useState(false);
  const [activePromoCards, setActivePromoCards] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirmSend, setConfirmSend] = useState(null);
  const [customEmail, setCustomEmail] = useState('');
  const [testEmails, setTestEmails] = useState([]);
  const [newTestEmail, setNewTestEmail] = useState({ email: '', name: '' });
  // confirmSend: null | 'test-eservice' | 'test-smtp' | 'all-eservice' | 'all-smtp'
  const [sendMethod, setSendMethod] = useState(null); // 가장 최근 사용한 방식 기록
  const [smtpAccount, setSmtpAccount] = useState('both'); // 'both' | 'account1' | 'account2'

  // ─── 페이스북 게시 관련 state ───
  const [fbPromoCards, setFbPromoCards] = useState([]); // 페북 채널 활성 카드 (미리보기/게시용)
  const [fbReadyState, setFbReadyState] = useState(fbReadyNews); // 페북 준비된 뉴스 (서버에서 초기값, 게시 후 갱신)
  const [isFbPublishing, setIsFbPublishing] = useState(false);
  const [fbConfirmId, setFbConfirmId] = useState(null); // 게시 확인 다이얼로그용 newsItemId
  const [fbResults, setFbResults] = useState({}); // { newsItemId: { permalink, pageResults, summary } }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTestEmails = () => {
    fetch('/api/test-emails')
      .then(r => r.json())
      .then(d => { if (d.success) setTestEmails(d.emails || []); })
      .catch(() => { });
  };

  useEffect(() => {
    // 이메일용 활성 카드 (channel=email 명시 + null 카드 자동 포함)
    fetch('/api/promo-cards/active?channel=email')
      .then(r => r.json())
      .then(d => { if (d.success) setActivePromoCards(d.cards || []); })
      .catch(() => { });

    // 페북용 활성 카드 — fb-publish API 와 동일한 로직 (kind=self 먼저, kind=ad 나중)
    // 으로 호출해서 미리보기와 실제 게시 순서를 일치시킴.
    // 자체 홍보 카드(씬짜오 앱 등)가 광고 카드보다 먼저 본문에 노출.
    Promise.all([
      fetch('/api/promo-cards/active?kind=self&channel=facebook').then(r => r.json()),
      fetch('/api/promo-cards/active?kind=ad&channel=facebook').then(r => r.json()),
    ]).then(([selfD, adD]) => {
      const merged = [...(selfD.cards || []), ...(adD.cards || [])];
      setFbPromoCards(merged);
    }).catch(() => { });

    fetchTestEmails();
  }, []);

  // 페이스북 4페이지 게시 실행
  const handleFbPublish = async (newsItemId) => {
    setFbConfirmId(null);
    setIsFbPublishing(true);
    try {
      const res = await fetch('/api/fb-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newsItemId }),
      });
      const data = await res.json();
      if (data.success) {
        setFbResults(prev => ({ ...prev, [newsItemId]: { permalink: data.permalink, pageResults: data.pageResults, summary: data.summary } }));
        // 게시 완료 표시 — fbReadyState 의 해당 항목 isSentSNS=true 로 업데이트
        setFbReadyState(prev => prev.map(n => n.id === newsItemId ? { ...n, isSentSNS: true, facebookPermalink: data.permalink } : n));
        const { success: succ, failure: fail, total } = data.summary || {};
        showToast(`✅ 페북 게시 완료 (${succ ?? '?'}/${total ?? '?'} 페이지)`);
      } else if (data.alreadyPosted) {
        showToast('⚠️ 이미 게시된 뉴스입니다', 'error');
        setFbReadyState(prev => prev.map(n => n.id === newsItemId ? { ...n, isSentSNS: true, facebookPermalink: data.permalink } : n));
      } else {
        showToast(`❌ 페북 게시 실패: ${data.error}`, 'error');
      }
    } catch (e) {
      showToast(`❌ 페북 게시 오류: ${e.message}`, 'error');
    }
    setIsFbPublishing(false);
  };

  const handleAddTestEmail = async () => {
    const email = newTestEmail.email.trim();
    if (!email) return;
    const res = await fetch('/api/test-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: newTestEmail.name.trim() || null })
    });
    const data = await res.json();
    if (data.success) {
      setNewTestEmail({ email: '', name: '' });
      fetchTestEmails();
      showToast(`✅ ${email} 추가됨`);
    } else {
      showToast(`❌ ${data.error}`, 'error');
    }
  };

  const handleDeleteTestEmail = async (id, email) => {
    const res = await fetch(`/api/test-emails/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchTestEmails();
      showToast(`🗑️ ${email} 삭제됨`);
    } else {
      showToast(`❌ ${data.error}`, 'error');
    }
  };

  // 모든 뉴스를 평탄화하여 계산
  const allNews = useMemo(() => {
    return Object.values(newsData).flat();
  }, [newsData]);

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === allNews.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allNews.map(n => n.id));
    }
  };

  const toggleSelectCategory = (category) => {
    const categoryNews = newsData[category] || [];
    const categoryIds = categoryNews.map(n => n.id);
    const allSelected = categoryIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !categoryIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...categoryIds])]);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('이 뉴스를 삭제하시겠습니까?\nWordPress 포스트는 휴지통으로 이동하고, 데이터베이스에서도 삭제됩니다.')) {
      return;
    }

    startTransition(async () => {
      const result = await deletePublishedNewsAction(id);
      if (result.success) {
        // 카테고리별 데이터에서도 삭제
        setNewsData(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(cat => {
            updated[cat] = updated[cat].filter(n => n.id !== id);
            if (updated[cat].length === 0) {
              delete updated[cat];
            }
          });
          return updated;
        });
        setSelectedIds(prev => prev.filter(i => i !== id));
        alert(result.message || '삭제되었습니다.');
      } else {
        alert(`삭제 실패: ${result.error}`);
      }
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      alert('삭제할 뉴스를 선택해주세요.');
      return;
    }

    if (!confirm(`선택한 ${selectedIds.length}개 뉴스를 삭제하시겠습니까?\nWordPress 포스트는 휴지통으로 이동하고, 데이터베이스에서도 삭제됩니다.`)) {
      return;
    }

    startTransition(async () => {
      const result = await batchDeletePublishedNewsAction(selectedIds);
      if (result.success) {
        // 카테고리별 데이터에서도 삭제
        setNewsData(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(cat => {
            updated[cat] = updated[cat].filter(n => !selectedIds.includes(n.id));
            if (updated[cat].length === 0) {
              delete updated[cat];
            }
          });
          return updated;
        });
        setSelectedIds([]);
        alert(result.message || '삭제되었습니다.');
      } else {
        alert(`삭제 실패: ${result.error}`);
      }
    });
  };

  // 발송 실행 (confirmSend 타입에 따라 방식 결정)
  const executeSend = async (type) => {
    const isTest = type.startsWith('test');
    const forceSmtp = type.endsWith('smtp');
    if (isTest) setIsTestSending(true); else setIsAllSending(true);
    setConfirmSend(null);
    try {
      const res = await fetch('/api/send-daily-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: isTest, forceSmtp, smtpAccount: forceSmtp ? smtpAccount : undefined })
      });
      const result = await res.json();
      if (result.success) {
        setSendMethod(result.method);
        const label = result.method === 'smtp' ? '📧 SMTP BCC' : '📨 e-service';
        showToast(`✅ [${label}] 발송 완료! ${result.message}`);
      } else {
        showToast(`❌ 발송 실패: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`❌ 오류: ${e.message}`, 'error');
    }
    if (isTest) setIsTestSending(false); else setIsAllSending(false);
  };

  const handleCustomEmail = async () => {
    const email = customEmail.trim();
    if (!email) return;
    setIsSending(true);
    try {
      const res = await fetch('/api/send-daily-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customEmail: email })
      });
      const result = await res.json();
      if (result.success) {
        showToast(`✅ ${email} 으로 발송 완료!`);
        setCustomEmail('');
      } else {
        showToast(`❌ 발송 실패: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`❌ 오류: ${e.message}`, 'error');
    }
    setIsSending(false);
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const res = await fetch('/api/send-daily-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`미리보기 실패: ${data.error || res.statusText}`);
        setIsPreviewing(false);
        return;
      }
      const html = await res.text();
      setPreviewHtml(html);
    } catch (e) {
      alert(`미리보기 오류: ${e.message}`);
    }
    setIsPreviewing(false);
  };

  const getTranslationStatus = (item) => {
    if (item.translationStatus === 'COMPLETED') {
      return { label: '완료', color: 'bg-green-100 text-green-700', icon: CheckCircle };
    }
    if (item.translatedTitle && item.translatedContent) {
      return { label: '초안', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle };
    }
    return { label: '미번역', color: 'bg-red-100 text-red-700', icon: XCircle };
  };

  return (
    <>
      {/* ─── 토스트 알림 ─── */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, padding: '14px 28px', borderRadius: '10px', fontWeight: 'bold',
          fontSize: '15px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
          color: toast.type === 'error' ? '#991b1b' : '#166534',
          border: `2px solid ${toast.type === 'error' ? '#fca5a5' : '#86efac'}`,
          transition: 'all 0.3s ease',
          whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>
      )}

      {/* ─── 이메일 발송 패널 ─── */}
      <div className="bg-white rounded-xl shadow-md border-2 border-orange-300 mb-8">
        <div className="p-7 bg-orange-50 border-b-2 border-orange-200 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-orange-800">💌 오늘의 이메일 뉴스레터</h2>
            <p className="text-base text-gray-800 mt-2 font-semibold">아래 카드들이 이메일에 함께 발송됩니다 · 구독자 <strong className="text-orange-700">{subscriberCount.toLocaleString()}명</strong></p>
          </div>
          {/* 버튼 영역 */}
          {confirmSend ? (
            /* 2단계: 발송 방식 + 인원 확인 */
            <div className="flex items-center gap-3 bg-red-50 border-2 border-red-300 rounded-lg px-4 py-2.5">
              <span className="text-base font-bold text-red-800">
                {confirmSend.endsWith('smtp') ? '📧 SMTP BCC' : '📨 e-service'}
                {' · '}
                {confirmSend.startsWith('test')
                  ? testEmails.length > 0
                    ? `테스트 ${testEmails.length}명 발송?`
                    : '테스트 수신자 없음'
                  : `구독자 ${subscriberCount.toLocaleString()}명 전체 발송?`}
              </span>
              <button
                onClick={() => executeSend(confirmSend)}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-base font-bold hover:bg-red-700 cursor-pointer shadow-sm"
              >
                ✅ 발송
              </button>
              <button
                onClick={() => setConfirmSend(null)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-base font-bold hover:bg-gray-300 cursor-pointer"
              >
                ✕ 취소
              </button>
            </div>
          ) : (
            /* 1단계: 미리보기 + 발송방식별 버튼 */
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={handlePreview} disabled={isPending || isPreviewing}
                className="px-4 py-2.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 text-base font-bold cursor-pointer disabled:cursor-not-allowed shadow-sm">
                {isPreviewing ? '⏳' : '👁️'} 미리보기
              </button>
              {/* e-service 테스트 */}
              <button onClick={() => setConfirmSend('test-eservice')} disabled={isTestSending || isAllSending || isPending}
                className="px-4 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-base font-bold cursor-pointer disabled:cursor-not-allowed shadow-sm">
                {isTestSending ? '⏳' : '🧪'} 테스트(e-service)
              </button>
              {/* SMTP BCC 테스트 */}
              <button onClick={() => setConfirmSend('test-smtp')} disabled={isTestSending || isAllSending || isPending}
                className="px-4 py-2.5 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 text-base font-bold cursor-pointer disabled:cursor-not-allowed shadow-sm">
                {isTestSending ? '⏳' : '🧪'} 테스트(SMTP)
              </button>
              {/* SMTP 계정 선택 드롭다운 */}
              <select
                value={smtpAccount}
                onChange={e => setSmtpAccount(e.target.value)}
                className="px-3 py-2.5 border-2 border-teal-400 rounded-md text-base bg-teal-50 text-teal-900 font-bold cursor-pointer"
                title="SMTP 발송 계정 선택"
              >
                <option value="both">📊 균등 분산 (전체)</option>
                <option value="account1">계정1 (info@)</option>
                <option value="account2">계정2 (younghan146@)</option>
                <option value="account3">계정3 (xinchao.id@)</option>
              </select>
              {/* 구분선 */}
              <span className="text-gray-400 select-none text-xl">|</span>
              {/* e-service 전체 */}
              <button onClick={() => setConfirmSend('all-eservice')} disabled={isTestSending || isAllSending || isPending}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-base font-bold cursor-pointer disabled:cursor-not-allowed shadow-sm flex items-center gap-1.5">
                {isAllSending ? <><Send size={16} /> 발송 중...</> : <><Send size={16} /> e-service 전체</>}
              </button>
              {/* SMTP BCC 전체 */}
              <button onClick={() => setConfirmSend('all-smtp')} disabled={isTestSending || isAllSending || isPending}
                className="px-4 py-2.5 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-base font-bold cursor-pointer disabled:cursor-not-allowed shadow-sm flex items-center gap-1.5">
                {isAllSending ? <><Send size={16} /> 발송 중...</> : <><Send size={16} /> SMTP 전체</>}
              </button>
            </div>
          )}
        </div>
        {/* 🧪 테스트 발송 대상 이메일 관리 */}
        <div className="px-7 py-5 border-t-2 border-orange-100 bg-green-50">
          <p className="text-base font-bold text-green-800 mb-3">🧪 테스트 발송 수신자 목록 ({testEmails.length}명)</p>
          {testEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {testEmails.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1.5 bg-white border-2 border-green-300 rounded-full px-3 py-1.5 text-sm text-gray-800">
                  {t.name ? <strong>{t.name}</strong> : null}
                  {t.name ? ' · ' : null}
                  {t.email}
                  <button onClick={() => handleDeleteTestEmail(t.id, t.email)} className="ml-1 text-red-500 hover:text-red-700 font-bold cursor-pointer text-base">✕</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 mb-3">등록된 테스트 이메일 없음 (아래에서 추가)</p>
          )}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newTestEmail.name}
              onChange={e => setNewTestEmail(p => ({ ...p, name: e.target.value }))}
              placeholder="이름 (선택)"
              className="w-28 px-3 py-2 border-2 border-gray-300 rounded text-sm focus:outline-none focus:border-green-500"
            />
            <input
              type="email"
              value={newTestEmail.email}
              onChange={e => setNewTestEmail(p => ({ ...p, email: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleAddTestEmail()}
              placeholder="이메일 주소"
              className="flex-1 px-3 py-2 border-2 border-gray-300 rounded text-sm focus:outline-none focus:border-green-500"
            />
            <button
              onClick={handleAddTestEmail}
              disabled={!newTestEmail.email.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm font-bold hover:bg-green-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shadow-sm"
            >
              ➕ 추가
            </button>
          </div>
        </div>
        {/* 이메일에 포함되는 카드 미리보기 */}
        <div className="p-7 flex gap-4 flex-wrap">
          {/* 뉴스 카드 */}
          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border-2 border-blue-200 flex-1 min-w-[220px]">
            <span className="text-3xl">📰</span>
            <div>
              <p className="text-base font-bold text-blue-800">오늘의 뉴스 카드</p>
              <p className="text-sm text-gray-700">뉴스 터미널 ({allNews.length}개 기사)</p>
            </div>
          </div>
          {/* 홍보 카드들 */}
          {activePromoCards.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 flex-1 min-w-[220px]">
              <span className="text-3xl">📭</span>
              <div>
                <p className="text-base font-bold text-gray-700">활성 홍보카드 없음</p>
                <a href="/admin/promo-cards" className="text-sm text-blue-600 underline font-medium">홍보카드 관리에서 ON 설정</a>
              </div>
            </div>
          ) : (
            activePromoCards.map(card => {
              const ytMatch = card.videoUrl?.match(/(?:youtube\.com.*v=|youtu\.be\/)([^&\n?#]+)/);
              const ytId = ytMatch ? ytMatch[1] : null;
              const thumb = card.imageUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null);
              return (
                <div key={card.id} className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg border-2 border-orange-200 flex-1 min-w-[220px]">
                  {thumb && <img src={thumb} alt={card.title} className="w-16 h-12 object-cover rounded" onError={e => e.target.style.display = 'none'} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-orange-800 truncate">{card.title}</p>
                    <a href={`/promo/${card.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline truncate block font-medium">프로모 페이지 보기</a>
                  </div>
                  <span className="ml-auto text-sm bg-orange-100 text-orange-800 px-2.5 py-1 rounded-full font-bold flex-shrink-0 border border-orange-300">ON</span>
                </div>
              );
            })
          )}
        </div>
        <div className="px-7 pb-5 text-right">
          <a href="/admin/promo-cards" className="text-base text-blue-700 underline hover:text-orange-700 font-semibold">홍보카드 관리 (ON/OFF 변경) →</a>
        </div>
      </div>

      {/* ─── 페이스북 4페이지 게시 패널 ─── */}
      <div className="bg-white rounded-xl shadow-md border-2 border-blue-300 mb-8">
        <div className="p-7 bg-blue-50 border-b-2 border-blue-200">
          <h2 className="text-2xl font-bold text-blue-800">📘 페이스북 4페이지 게시</h2>
          <p className="text-base text-gray-800 mt-2 font-semibold">
            {fbReadyState.length === 0
              ? "오늘 페북 카드로 준비된 뉴스가 없습니다 — '전령카드 확인하기' 에서 페이스북 카드 준비를 먼저 실행하세요"
              : <>준비됨 <strong className="text-blue-700">{fbReadyState.length}건</strong> · 페북 채널 활성 광고 <strong className="text-blue-700">{fbPromoCards.length}장</strong> 함께 게시됨</>}
          </p>
          {fbReadyState.length > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg text-base text-yellow-900 leading-loose">
              ⚠️ <strong className="text-lg">발송 흐름</strong>: 아래 미리보기 확인 → <strong>"📘 페이스북 4페이지 게시"</strong> 클릭 → <strong>확인 다이얼로그의 "✅ 게시"</strong> 클릭 시 <strong className="text-red-700">실제 4개 페이지에 즉시 발송</strong>됩니다 (되돌릴 수 없음). 미리보기와 광고 자리를 충분히 확인하세요.
            </div>
          )}
        </div>

        {fbReadyState.length > 0 && (
          <div className="p-7 space-y-7">
            {fbReadyState.map(news => {
              const result = fbResults[news.id];
              const permalink = result?.permalink || news.facebookPermalink;
              const isPosted = news.isSentSNS;
              const isConfirming = fbConfirmId === news.id;

              return (
                <div key={news.id} className="border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm">
                  {/* 뉴스 제목 + 상태 배지 */}
                  <div className="p-5 bg-gray-50 border-b-2 border-gray-200 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-gray-900 truncate">
                        {news.translatedTitle || news.title}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        카드 준비: {new Date(news.updatedAt).toLocaleString('ko-KR')}
                      </p>
                    </div>
                    {isPosted ? (
                      <span className="text-sm bg-green-100 text-green-800 px-3 py-1.5 rounded-full font-bold whitespace-nowrap border border-green-300">
                        ✅ 게시 완료
                      </span>
                    ) : (
                      <span className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-full font-bold whitespace-nowrap border border-yellow-300">
                        ⏳ 게시 대기
                      </span>
                    )}
                  </div>

                  {/* 페북 그리드 미리보기 (큰 위 1 + 작은 아래 2) + 카드 식별 정보 */}
                  <div className="p-7 bg-gradient-to-b from-gray-50 to-white">
                    <p className="text-base font-bold text-gray-800 mb-4">📐 페이스북 그리드 미리보기 (실제 게시 모양)</p>
                    <div style={{ maxWidth: '600px', margin: '0 auto', display: 'grid', gap: '5px', borderRadius: '10px', overflow: 'hidden', border: '2px solid #d1d5db' }}>
                      {/* 큰 위 1장 — 뉴스카드 */}
                      <img
                        src={news.cardImageUrl}
                        alt="뉴스카드"
                        style={{ width: '100%', height: '314px', objectFit: 'cover', display: 'block' }}
                      />
                      {/* 작은 아래 2장 — 페북 광고 */}
                      {fbPromoCards.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: fbPromoCards.length === 1 ? '1fr' : '1fr 1fr', gap: '5px' }}>
                          {fbPromoCards.slice(0, 2).map(card => (
                            <img
                              key={card.id}
                              src={card.imageUrlFacebook || card.imageUrl}
                              alt={card.title}
                              style={{ width: '100%', height: '157px', objectFit: 'cover', display: 'block' }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-gray-100 text-center text-base text-gray-700 font-semibold">
                          페북 채널 활성 광고 없음 — 뉴스카드만 게시됩니다
                        </div>
                      )}
                    </div>

                    {/* 광고 카드 식별 정보 + 변경 안내 */}
                    {fbPromoCards.length > 0 && (
                      <div style={{ maxWidth: '600px', margin: '18px auto 0' }}>
                        <p className="text-base font-bold text-gray-800 mb-3">📋 본문 carousel 에 들어가는 광고 ({Math.min(2, fbPromoCards.length)}개)</p>
                        <div className="grid grid-cols-1 gap-2">
                          {fbPromoCards.slice(0, 2).map((card, idx) => (
                            <div key={card.id} className="flex items-center gap-3 px-4 py-3 bg-white border-2 border-gray-200 rounded-lg text-base">
                              <span className="text-gray-500 font-mono font-bold text-base">#{idx + 2}</span>
                              <span className={`text-xs font-bold px-2 py-1 rounded ${card.kind === 'self' ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-green-100 text-green-800 border border-green-300'}`}>
                                {card.kind === 'self' ? '자체' : '광고주'}
                              </span>
                              <span className="flex-1 truncate font-bold text-gray-900">{card.title}</span>
                              <a
                                href={`/admin/promo-cards`}
                                className="text-blue-600 hover:text-blue-800 text-sm font-bold whitespace-nowrap"
                                title="홍보카드 관리에서 편집"
                              >편집 →</a>
                            </div>
                          ))}
                        </div>

                        {/* 캡션에만 노출되는 추가 카드 (3번째 이후) */}
                        {fbPromoCards.length > 2 && (
                          <details className="mt-2">
                            <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900 font-medium py-1">
                              + 캡션 텍스트에만 노출 ({fbPromoCards.length - 2}개 — 사진 없음, 광고주 이름·링크만)
                            </summary>
                            <div className="mt-2 grid grid-cols-1 gap-1.5">
                              {fbPromoCards.slice(2).map(card => (
                                <div key={card.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-300 rounded text-sm text-gray-700">
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${card.kind === 'self' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                    {card.kind === 'self' ? '자체' : '광고주'}
                                  </span>
                                  <span className="flex-1 truncate font-medium">{card.title}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        {/* 광고 변경 안내 + 빠른 링크 */}
                        <div className="mt-5 p-5 bg-blue-50 border-2 border-blue-300 rounded-lg text-base text-blue-900 leading-loose">
                          🎯 <strong className="text-lg">광고 카드 변경 방법</strong>: 아래 링크 → 카드 편집에서 <strong>채널 체크박스(📘 페북)</strong> / <strong>정렬 순서</strong> / <strong>활성화(ON/OFF)</strong> 조정 후 이 페이지 새로고침. 카드 순서는 sortOrder 낮을수록 앞.
                          <a href="/admin/promo-cards" target="_blank" rel="noopener noreferrer"
                             className="block mt-3 text-center bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold text-base transition-colors shadow-sm">
                            🎯 홍보카드 관리 페이지 열기 (새 탭)
                          </a>
                        </div>
                      </div>
                    )}

                    <p className="text-base text-gray-700 text-center mt-5 font-semibold">
                      ⓘ 페북이 자동으로 그리드로 배치합니다. 클릭 시 갤러리에서 풀사이즈 노출.
                    </p>
                  </div>

                  {/* 게시 버튼 또는 결과 */}
                  <div className="p-6 bg-white border-t-2 border-gray-200">
                    {isPosted ? (
                      <div className="flex items-center gap-2">
                        {permalink && (
                          <>
                            <a
                              href={permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 text-center bg-[#1877f2] hover:bg-[#166fe5] text-white py-3 rounded-md font-bold text-base transition-colors shadow-sm"
                            >
                              📘 게시물 보기 (페북 새 탭)
                            </a>
                            <button
                              onClick={() => navigator.clipboard.writeText(permalink).then(() => showToast('📋 링크 복사됨'))}
                              className="px-4 py-3 bg-gray-100 text-gray-800 rounded-md text-base font-bold hover:bg-gray-200 border border-gray-300"
                            >
                              📋 링크 복사
                            </button>
                          </>
                        )}
                      </div>
                    ) : isConfirming ? (
                      <div className="flex items-center gap-3 bg-red-50 border-2 border-red-400 rounded-lg p-3">
                        <span className="flex-1 text-base font-bold text-red-800">
                          페이스북 4페이지에 실제 게시하시겠습니까?
                        </span>
                        <button
                          onClick={() => handleFbPublish(news.id)}
                          disabled={isFbPublishing}
                          className="px-5 py-2.5 bg-red-600 text-white rounded-md text-base font-bold hover:bg-red-700 disabled:opacity-50 shadow-sm"
                        >
                          ✅ 게시
                        </button>
                        <button
                          onClick={() => setFbConfirmId(null)}
                          className="px-5 py-2.5 bg-gray-200 text-gray-800 rounded-md text-base font-bold hover:bg-gray-300"
                        >
                          ✕ 취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setFbConfirmId(news.id)}
                        disabled={isFbPublishing}
                        className="w-full bg-[#1877f2] hover:bg-[#166fe5] text-white py-3.5 rounded-md font-bold text-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                      >
                        {isFbPublishing ? (
                          <><span className="animate-spin">⏳</span> 게시 중...</>
                        ) : (
                          <>📘 페이스북 4페이지 게시</>
                        )}
                      </button>
                    )}

                    {/* 페이지별 결과 (게시 후) */}
                    {result?.pageResults && result.pageResults.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {result.pageResults.map(pr => (
                          <div key={pr.pageId} className={`text-sm font-medium px-3 py-2 rounded ${pr.ok ? 'bg-green-50 text-green-800 border border-green-300' : 'bg-red-50 text-red-800 border border-red-300'}`}>
                            {pr.ok ? '✅' : '❌'} <strong>{pr.name}</strong>{pr.attempts > 1 ? ` (${pr.attempts}회)` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* 헤더 */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === allNews.length && allNews.length > 0}
                onChange={toggleSelectAll}
                className="w-4 h-4 text-red-600 rounded cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700">
                전체 선택 ({selectedIds.length}/{allNews.length})
              </span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <button
                onClick={handleBatchDelete}
                disabled={isPending}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
              >
                <Trash2 size={16} />
                선택 삭제 ({selectedIds.length})
              </button>
            )}
            <span className="text-sm text-gray-600 ml-2">총 {allNews.length}개</span>
          </div>
        </div>

        {/* 카테고리별 뉴스 목록 */}
        <div className="divide-y divide-gray-200">
          {categories.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              오늘 발행된 뉴스가 없습니다.
            </div>
          ) : (
            categories.map((category) => {
              const categoryNews = newsData[category] || [];
              if (categoryNews.length === 0) return null;

              const categoryLabel = categoryLabels[category] || category;
              const categorySelectedIds = categoryNews.filter(n => selectedIds.includes(n.id)).map(n => n.id);
              const allCategorySelected = categoryNews.length > 0 && categorySelectedIds.length === categoryNews.length;

              return (
                <div key={category} className="border-b border-gray-300">
                  {/* 카테고리 헤더 */}
                  <div className="p-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allCategorySelected}
                          onChange={() => toggleSelectCategory(category)}
                          className="w-4 h-4 text-red-600 rounded cursor-pointer"
                        />
                        <span className="font-semibold text-gray-800">
                          {categoryLabel}
                        </span>
                      </label>
                      <span className="text-sm text-gray-600">
                        ({categoryNews.length}개)
                      </span>
                    </div>
                  </div>

                  {/* 카테고리 내 뉴스 목록 */}
                  <div className="divide-y divide-gray-100">
                    {categoryNews.map((item) => {
                      const status = getTranslationStatus(item);
                      const StatusIcon = status.icon;

                      return (
                        <div
                          key={item.id}
                          className={`p-4 hover:bg-gray-50 transition-colors ${selectedIds.includes(item.id) ? 'bg-red-50' : ''
                            }`}
                        >
                          <div className="flex items-start gap-4">
                            {/* 체크박스 */}
                            <div className="pt-1">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(item.id)}
                                onChange={() => toggleSelect(item.id)}
                                className="w-4 h-4 text-red-600 rounded cursor-pointer"
                              />
                            </div>

                            {/* 내용 */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4 mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-blue-600 uppercase">
                                      {item.source}
                                    </span>
                                    {item.isTopNews && (
                                      <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded font-bold">
                                        ★ TOP
                                      </span>
                                    )}
                                    <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${status.color}`}>
                                      <StatusIcon size={12} />
                                      {status.label}
                                    </span>
                                  </div>
                                  <h3 className="font-medium text-gray-900 mb-1">
                                    {item.translatedTitle || item.title}
                                  </h3>
                                  {item.translatedTitle && (
                                    <p className="text-xs text-gray-500 mb-2">
                                      {item.title}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>
                                  {item.publishedAt
                                    ? new Date(item.publishedAt).toLocaleString('ko-KR', {
                                      timeZone: 'Asia/Ho_Chi_Minh',
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                    : '날짜 없음'
                                  }
                                </span>
                                {item.wordpressUrl && (
                                  <a
                                    href={item.wordpressUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                  >
                                    <ExternalLink size={12} />
                                    WordPress 보기
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* 삭제 버튼 */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDelete(item.id)}
                                disabled={isPending}
                                className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                title="삭제"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div >

      {/* 이메일 미리보기 모달 */}
      {
        previewHtml && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewHtml(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-bold text-lg">📧 이메일 미리보기 (뉴스 + 홍보카드)</h2>
                <div className="flex gap-2 flex-wrap justify-end">
                  {/* PDF 인쇄 */}
                  <button
                    onClick={() => {
                      const iframe = document.querySelector('iframe[title="이메일 미리보기"]');
                      if (iframe) iframe.contentWindow.print();
                    }}
                    className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 font-bold text-sm cursor-pointer"
                  >
                    🖨️ 인쇄 / PDF저장
                  </button>
                  {/* 뉴스 URL 복사 (SNS용) */}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText('https://chaovietnam.co.kr/daily-news-terminal/');
                      showToast('✅ 뉴스 URL 복사 완료! SNS에 붙여넣기 하세요.');
                      setPreviewHtml(null);
                    }}
                    className="px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 font-bold text-sm cursor-pointer"
                  >
                    📤 SNS용 URL 복사
                  </button>
                  {/* e-service 전체 발송 */}
                  <button
                    onClick={() => {
                      setPreviewHtml(null);
                      setConfirmSend('all-eservice');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold text-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Send size={14} /> e-service 발송
                  </button>
                  {/* SMTP BCC 전체 발송 */}
                  <button
                    onClick={() => {
                      setPreviewHtml(null);
                      setConfirmSend('all-smtp');
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-bold text-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Send size={14} /> SMTP 발송
                  </button>
                  <button onClick={() => setPreviewHtml(null)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 font-bold text-sm cursor-pointer">✕ 닫기</button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                  title="이메일 미리보기"
                />
              </div>
            </div>
          </div>
        )
      }
    </>
  );
}
