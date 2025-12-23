"use client";

import { useSearchParams, useRouter } from "next/navigation";

export default function CardPreviewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const imageUrl = searchParams.get("imageUrl");

  const handleClose = () => {
    window.close(); // 새 탭이면 닫기 시도
    if (!window.closed) {
      router.back(); // 닫기 실패하면 뒤로가기
    }
  };

  if (!imageUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-xl text-gray-600 mb-4">이미지 URL이 없습니다.</p>
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      {/* 이미지 표시 */}
      <div className="mb-6 shadow-2xl rounded-lg overflow-hidden">
        <img
          src={imageUrl}
          alt="Card News Preview"
          className="max-w-full h-auto"
          style={{ maxHeight: "80vh" }}
        />
      </div>

      {/* 닫기 버튼만 */}
      <button
        onClick={handleClose}
        className="px-8 py-4 bg-gray-600 text-white rounded-lg font-bold hover:bg-gray-700 transition-colors text-lg"
      >
        ✕ 닫기
      </button>
    </div>
  );
}

