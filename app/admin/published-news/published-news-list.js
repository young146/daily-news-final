'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { Trash2, ExternalLink, CheckCircle, XCircle, AlertCircle, Send } from 'lucide-react';
import { deletePublishedNewsAction, batchDeletePublishedNewsAction, sendDailyEmailAction } from '../actions';

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
  const [isSending, setIsSending] = useState(false);
  const [activePromoCards, setActivePromoCards] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirmSend, setConfirmSend] = useState(null); // null | 'test' | 'all'

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetch('/api/promo-cards/active')
      .then(r => r.json())
      .then(d => { if (d.success) setActivePromoCards(d.cards || []); })
      .catch(() => { });
  }, []);

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
    setIsSending(true);
    setConfirmSend(null);
    const result = await sendDailyEmailAction();
    setIsSending(false);
    if (result.success) {
      showToast(`✅ 전체 발송 완료! ${result.message}`);
    } else {
      showToast(`❌ 메일 발송 실패: ${result.error}`, 'error');
    }
  };

  const handleTestEmail = async () => {
    setIsSending(true);
    setConfirmSend(null);
    const result = await sendDailyEmailAction(true);
    setIsSending(false);
    if (result.success) {
      showToast('✅ 테스트 발송 완료! younghan146@gmail.com 을 확인하세요.');
    } else {
      showToast(`❌ 테스트 실패: ${result.error}`, 'error');
    }
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
                {confirmSend === 'test' ? '🧪 younghan146@gmail.com 으로 테스트 발송?' : `📧 구독자 ${subscriberCount.toLocaleString()}명 전체 발송?`}
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
              <button onClick={() => setConfirmSend('test')} disabled={isSending || isPending}
                className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium cursor-pointer disabled:cursor-not-allowed">
                {isSending ? '⏳ 발송 중...' : '🧪 테스트 발송'}
              </button>
              <button onClick={() => setConfirmSend('all')} disabled={isSending || isPending}
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium cursor-pointer disabled:cursor-not-allowed">
                {isSending ? <><Send size={14} /> 발송 중...</> : <><Send size={14} /> 전체 발송</>}
              </button>
            </div>
          )}
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
            <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">자동</span>
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
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!confirm(`📧 이메일 구독자 ${subscriberCount.toLocaleString()}명 전체에게 발송하겠습니까?`)) return;
                      setPreviewHtml(null);
                      handleSendEmail();
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold text-sm flex items-center gap-2"
                  >
                    <Send size={14} /> 이대로 발송
                  </button>
                  <button onClick={() => setPreviewHtml(null)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 font-bold text-sm">✕ 닫기</button>
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
