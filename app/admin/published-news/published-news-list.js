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

export default function PublishedNewsList({ groupedNews, categories, subscriberCount = 0 }) {
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
    fetch('/api/promo-cards/active')
      .then(r => r.json())
      .then(d => { if (d.success) setActivePromoCards(d.cards || []); })
      .catch(() => { });
    fetchTestEmails();
  }, []);

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

  const handleSendEmail = async () => {
    setIsAllSending(true);
    setConfirmSend(null);
    try {
      const res = await fetch('/api/send-daily-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (result.success) {
        showToast(`✅ 전체 발송 완료! ${result.message}`);
      } else {
        showToast(`❌ 메일 발송 실패: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`❌ 오류: ${e.message}`, 'error');
    }
    setIsAllSending(false);
  };

  const handleTestEmail = async () => {
    setIsTestSending(true);
    setConfirmSend(null);
    try {
      const res = await fetch('/api/send-daily-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true })
      });
      const result = await res.json();
      if (result.success) {
        showToast(`✅ 테스트 발송 완료! ${result.message}`);
      } else {
        showToast(`❌ 테스트 실패: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`❌ 오류: ${e.message}`, 'error');
    }
    setIsTestSending(false);
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
      <div className="bg-white rounded-lg shadow-sm border-2 border-orange-200 mb-4">
        <div className="p-4 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-orange-700">💌 오늘의 이메일 뉴스레터</h2>
            <p className="text-xs text-gray-500 mt-0.5">아래 카드들이 이메일에 함께 발송됩니다 · 구독자 <strong>{subscriberCount.toLocaleString()}명</strong></p>
          </div>
          {/* 버튼 영역 */}
          {confirmSend ? (
            /* 2단계: 인라인 확인 */
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-sm font-bold text-red-700">
                {confirmSend === 'test'
                  ? testEmails.length > 0
                    ? `🧪 테스트 수신자 ${testEmails.length}명에게 발송?`
                    : `🧪 테스트 발송 (수신자 목록에서 추가 필요)`
                  : `📧 구독자 ${subscriberCount.toLocaleString()}명 전체 발송?`}
              </span>
              <button
                onClick={confirmSend === 'test' ? handleTestEmail : handleSendEmail}
                className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 cursor-pointer"
              >
                ✅ 발송
              </button>
              <button
                onClick={() => setConfirmSend(null)}
                className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm font-bold hover:bg-gray-300 cursor-pointer"
              >
                ✕ 취소
              </button>
            </div>
          ) : (
            /* 1단계: 기본 버튼 3개 */
            <div className="flex items-center gap-2">
              <button onClick={handlePreview} disabled={isPending || isPreviewing}
                className="px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 text-sm font-medium cursor-pointer disabled:cursor-not-allowed">
                {isPreviewing ? '⏳' : '👁️'} 미리보기
              </button>
              <button onClick={() => setConfirmSend('test')} disabled={isTestSending || isAllSending || isPending}
                className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium cursor-pointer disabled:cursor-not-allowed">
                {isTestSending ? '⏳ 발송 중...' : '🧪 테스트 발송'}
              </button>
              <button onClick={() => setConfirmSend('all')} disabled={isTestSending || isAllSending || isPending}
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium cursor-pointer disabled:cursor-not-allowed">
                {isAllSending ? <><Send size={14} /> 발송 중...</> : <><Send size={14} /> 전체 발송</>}
              </button>
            </div>
          )}
        </div>
        {/* 🧪 테스트 발송 대상 이메일 관리 */}
        <div className="px-4 py-3 border-t border-orange-100 bg-green-50">
          <p className="text-xs font-bold text-green-700 mb-2">🧪 테스트 발송 수신자 목록 ({testEmails.length}명)</p>
          {testEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {testEmails.map(t => (
                <span key={t.id} className="inline-flex items-center gap-1 bg-white border border-green-200 rounded-full px-3 py-1 text-xs text-gray-700">
                  {t.name ? <strong>{t.name}</strong> : null}
                  {t.name ? ' · ' : null}
                  {t.email}
                  <button onClick={() => handleDeleteTestEmail(t.id, t.email)} className="ml-1 text-red-400 hover:text-red-600 font-bold cursor-pointer">✕</button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-2">등록된 테스트 이메일 없음 (아래에서 추가)</p>
          )}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newTestEmail.name}
              onChange={e => setNewTestEmail(p => ({ ...p, name: e.target.value }))}
              placeholder="이름 (선택)"
              className="w-24 px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-green-400"
            />
            <input
              type="email"
              value={newTestEmail.email}
              onChange={e => setNewTestEmail(p => ({ ...p, email: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleAddTestEmail()}
              placeholder="이메일 주소"
              className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-green-400"
            />
            <button
              onClick={handleAddTestEmail}
              disabled={!newTestEmail.email.trim()}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              ➕ 추가
            </button>
          </div>
        </div>
        {/* 이메일에 포함되는 카드 미리보기 */}
        <div className="p-4 flex gap-4 flex-wrap">
          {/* 뉴스 카드 */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200 flex-1 min-w-[200px]">
            <span className="text-2xl">📰</span>
            <div>
              <p className="text-xs font-bold text-blue-700">오늘의 뉴스 카드</p>
              <p className="text-xs text-gray-500">뉴스 터미널 ({allNews.length}개 기사)</p>
            </div>
          </div>
          {/* 홍보 카드들 */}
          {activePromoCards.length === 0 ? (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300 flex-1 min-w-[200px]">
              <span className="text-2xl">📭</span>
              <div>
                <p className="text-xs font-bold text-gray-500">활성 홍보카드 없음</p>
                <a href="/admin/promo-cards" className="text-xs text-blue-500 underline">홍보카드 관리에서 ON 설정</a>
              </div>
            </div>
          ) : (
            activePromoCards.map(card => {
              const ytMatch = card.videoUrl?.match(/(?:youtube\.com.*v=|youtu\.be\/)([^&\n?#]+)/);
              const ytId = ytMatch ? ytMatch[1] : null;
              const thumb = card.imageUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null);
              return (
                <div key={card.id} className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200 flex-1 min-w-[200px]">
                  {thumb && <img src={thumb} alt={card.title} className="w-14 h-10 object-cover rounded" onError={e => e.target.style.display = 'none'} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-orange-700 truncate">{card.title}</p>
                    <a href={`/promo/${card.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 underline truncate block">프로모 페이지 보기</a>
                  </div>
                  <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold flex-shrink-0">ON</span>
                </div>
              );
            })
          )}
        </div>
        <div className="px-4 pb-3 text-right">
          <a href="/admin/promo-cards" className="text-xs text-gray-400 underline hover:text-orange-500">홍보카드 관리 (ON/OFF 변경) →</a>
        </div>
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
                  {/* 전체 발송 */}
                  <button
                    onClick={() => {
                      setPreviewHtml(null);
                      setConfirmSend('all');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold text-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Send size={14} /> 이대로 발송
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
