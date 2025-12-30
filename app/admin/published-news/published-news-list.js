'use client';

import { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { Trash2, ExternalLink, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
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

export default function PublishedNewsList({ groupedNews, categories }) {
  const [newsData, setNewsData] = useState(groupedNews);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isPending, startTransition] = useTransition();

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
          <span className="text-sm text-gray-600">
            총 {allNews.length}개
          </span>
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
                        className={`p-4 hover:bg-gray-50 transition-colors ${
                          selectedIds.includes(item.id) ? 'bg-red-50' : ''
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
    </div>
  );
}
