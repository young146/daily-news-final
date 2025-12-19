"use client";

import { useState } from "react";
import ManualNewsForm from "./manual-news-form";
import SuccessMessage from "./success-message";

export default function ManualNewsButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [editData, setEditData] = useState(null);

  const handleSuccess = (result, formData) => {
    setSuccessData({
      postUrl: result.postUrl,
      postId: result.postId,
      isEdit: result.isEdit || false,
      // 폼 데이터도 함께 저장
      title: formData?.title || "",
      content: formData?.content || "",
      category: formData?.category || "Society",
      source: formData?.source || "자체 취재",
    });
    setIsOpen(false);
    setShowSuccess(true);
  };

  const handleEdit = () => {
    // 수정 모드로 폼 다시 열기
    setEditData({
      title: successData.title || "",
      content: successData.content || "",
      category: successData.category || "Society",
      source: successData.source || "자체 취재",
      postId: successData.postId,
    });
    setShowSuccess(false);
    setIsOpen(true);
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    setSuccessData(null);
    // 페이지 새로고침하여 최신 상태 반영
    window.location.reload();
  };

  const handleCloseForm = () => {
    setIsOpen(false);
    setEditData(null);
  };

  return (
    <>
      <button
        onClick={() => {
          setEditData(null);
          setIsOpen(true);
        }}
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition flex items-center gap-2"
      >
        ✍️ 자체 취재 기사 작성
      </button>
      {isOpen && (
        <ManualNewsForm
          onClose={handleCloseForm}
          onSuccess={handleSuccess}
          editData={editData}
        />
      )}
      {showSuccess && successData && (
        <SuccessMessage
          postUrl={successData.postUrl}
          postId={successData.postId}
          onClose={handleCloseSuccess}
          onEdit={handleEdit}
        />
      )}
    </>
  );
}

