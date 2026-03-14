"use client";

import { useState } from 'react';
import { Mail, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function UnsubscribePage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setStatus('error');
      setMessage('유효한 이메일 주소를 입력해주세요.');
      return;
    }

    setStatus('loading');

    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage(data.message || '구독이 성공적으로 취소되었습니다.');
      } else {
        setStatus('error');
        setMessage(data.message || '오류가 발생했습니다.');
      }
    } catch (err) {
      setStatus('error');
      setMessage('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header Header */}
        <div className="bg-red-600 px-6 py-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">수신 거부 (Unsubscribe)</h1>
          <p className="text-red-100 text-sm">씬짜오베트남 데일리 뉴스</p>
        </div>

        {/* Content */}
        <div className="p-8">
          {status === 'success' ? (
            <div className="text-center space-y-4">
              <CheckCircle className="mx-auto w-16 h-16 text-green-500" />
              <h2 className="text-xl font-bold text-gray-800">수신 거부 완료</h2>
              <p className="text-gray-600 text-sm">
                그동안 데일리 뉴스를 구독해 주셔서 대단히 감사합니다.
                <br />
                더 나은 콘텐츠로 다시 찾아뵐 수 있도록 노력하겠습니다.
              </p>
              <div className="pt-6">
                <Link
                  href="/"
                  className="inline-flex items-center text-sm font-medium focus:outline-none transition-colors text-red-600 hover:text-red-800"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  홈 화면으로 돌아가기
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm mb-6">
                  더 이상 씬짜오베트남 오늘의 뉴스를 이메일 알림으로 받고 싶지 않으시다면, 지금 받으신 이메일 주소를 다시 한번 아래에 정확히 입력해 주세요.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    이메일 주소
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500 text-sm outline-none transition-shadow"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={status === 'loading'}
                    />
                  </div>
                </div>

                {status === 'error' && (
                  <div className="flex items-start p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="ml-2 text-sm text-red-700">{message}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gray-800 hover:bg-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'loading' ? '처리 중...' : '구독 해지하기'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
