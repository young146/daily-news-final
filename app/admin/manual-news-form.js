"use client";

import { useState, useEffect } from "react";

export default function ManualNewsForm({ onClose, onSuccess, editData = null }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("Society");
  const [source, setSource] = useState("자체 취재");
  const [images, setImages] = useState([]);
  const [featuredImageIndex, setFeaturedImageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [postId, setPostId] = useState(null);
  const [isTopNews, setIsTopNews] = useState(false);

  // 수정 모드일 때 기존 데이터 로드
  useEffect(() => {
    if (editData) {
      setTitle(editData.title || "");
      setContent(editData.content || "");
      setCategory(editData.category || "Society");
      setSource(editData.source || "자체 취재");
      setPostId(editData.postId || null);
      setIsTopNews(editData.isTopNews === true || editData.isTopNews === "1");
      // 이미지는 수정 시 새로 업로드해야 하므로 빈 배열로 시작
    }
  }, [editData]);

  const categories = [
    "Society",
    "Economy",
    "Culture",
    "Politics",
    "International",
    "Korea-Vietnam",
    "Community",
    "Travel",
    "Health",
    "Food",
    "Other",
  ];

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const newImages = files.map((file, index) => ({
      file,
      id: Date.now() + index,
      preview: URL.createObjectURL(file),
    }));
    setImages([...images, ...newImages]);
  };

  const removeImage = (id) => {
    setImages(images.filter((img) => img.id !== id));
    if (featuredImageIndex >= images.length - 1) {
      setFeaturedImageIndex(Math.max(0, featuredImageIndex - 1));
    }
  };

  const insertImagePlaceholder = (index) => {
    const placeholder = `[IMAGE_${images[index].id}]`;
    const textarea = document.getElementById("content-textarea");
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = content;
    const newText = text.substring(0, start) + placeholder + text.substring(end);
    setContent(newText);

    // 커서 위치 조정
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + placeholder.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!title.trim() || !content.trim()) {
      setError("제목과 본문은 필수입니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("content", content);
      formData.append("category", category);
      formData.append("source", source);
      formData.append("featuredImageIndex", featuredImageIndex.toString());
      formData.append("isTopNews", isTopNews ? "1" : "0");

      // 이미지 파일 추가
      images.forEach((img) => {
        formData.append(`image_${img.id}`, img.file);
      });

      // 수정 모드인지 확인
      const isEditMode = postId !== null;
      const apiUrl = isEditMode ? "/api/update-manual-news" : "/api/create-manual-news";
      const method = isEditMode ? "PUT" : "POST";

      if (isEditMode) {
        formData.append("postId", postId);
      }

      const response = await fetch(apiUrl, {
        method: method,
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || (isEditMode ? "수정 실패" : "발행 실패"));
      }

      if (onSuccess) {
        onSuccess({
          ...result,
          postId: result.postId || postId,
          isEdit: isEditMode,
        }, {
          title,
          content,
          category,
          source,
        });
      }

      // 성공 메시지는 부모 컴포넌트에서 처리하므로 여기서는 닫지 않음
    } catch (err) {
      setError(err.message || "오류가 발생했습니다.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">
            {postId ? "자체 취재 기사 수정" : "자체 취재 기사 작성"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* 제목 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              제목 *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="기사 제목을 입력하세요"
              required
            />
          </div>

          {/* 카테고리 & 출처 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                카테고리 *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                출처
              </label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="자체 취재"
              />
            </div>
            <div className="flex items-center mt-7">
              <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTopNews}
                  onChange={(e) => setIsTopNews(e.target.checked)}
                  className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs ml-1 shadow-sm border border-yellow-200">
                  🔥 탑뉴스로 지정
                </span>
              </label>
            </div>
          </div>

          {/* 이미지 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              사진 업로드 (복수 선택 가능)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />

            {images.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-4">
                {images.map((img, index) => (
                  <div
                    key={img.id}
                    className={`relative border-2 rounded-lg overflow-hidden ${featuredImageIndex === index
                        ? "border-blue-500 ring-2 ring-blue-300"
                        : "border-gray-200"
                      }`}
                  >
                    <img
                      src={img.preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-32 object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                      {index + 1}
                    </div>
                    {featuredImageIndex === index && (
                      <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                        대표
                      </div>
                    )}
                    <div className="p-2 bg-white">
                      <button
                        type="button"
                        onClick={() => setFeaturedImageIndex(index)}
                        className="w-full mb-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        대표로 설정
                      </button>
                      <button
                        type="button"
                        onClick={() => insertImagePlaceholder(index)}
                        className="w-full mb-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        본문에 삽입
                      </button>
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        className="w-full px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 본문 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              본문 * (줄간격과 폰트는 자동 적용됩니다)
            </label>
            <textarea
              id="content-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={15}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="본문을 입력하세요. 사진을 삽입하려면 '본문에 삽입' 버튼을 클릭하세요."
              required
            />
            <p className="mt-2 text-xs text-gray-500">
              💡 팁: 사진을 본문 중간에 넣으려면 커서를 원하는 위치에 두고 "본문에 삽입" 버튼을 클릭하세요.
            </p>
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? (postId ? "수정 중..." : "발행 중...")
                : (postId ? "수정하기" : "WordPress에 발행")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

