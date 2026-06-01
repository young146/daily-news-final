'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('password'); // 'password' | 'otp'
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError(data.error || '로그인 실패');
      }
    } catch (err) {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 이메일로 인증코드 요청
  const requestOtp = async () => {
    setError(''); setInfo('');
    if (!email) { setError('먼저 이메일을 입력하세요.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        setOtpSent(true);
        setInfo('인증코드를 이메일로 보냈습니다. 받은 6자리 코드를 입력하세요. (해당 주소가 관리자일 경우에만 발송)');
      } else {
        const d = await res.json();
        setError(d.error || '코드 발송 실패');
      }
    } catch { setError('서버 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  // 인증코드 검증 → 로그인
  const verifyOtp = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError(data.error || '인증 실패');
      }
    } catch { setError('서버 오류가 발생했습니다.'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)'
    }}>
      <div style={{
        background: 'white',
        padding: '48px',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        width: '100%',
        maxWidth: '420px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 'bold', 
            color: '#1f2937',
            marginBottom: '8px'
          }}>
            신짜오 뉴스레터
          </h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            관리자 로그인
          </p>
        </div>

        {/* 이메일 (공통) */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
            이메일
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="info@chaovietnam.co.kr"
            style={{ width: '100%', padding: '12px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {mode === 'password' ? (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                required
                style={{ width: '100%', padding: '12px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {error && (<div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '14px', marginBottom: '20px' }}>{error}</div>)}

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            {otpSent && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  인증코드 (6자리)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '24px', letterSpacing: '8px', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {error && (<div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '14px', marginBottom: '16px' }}>{error}</div>)}
            {info && (<div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#1e40af', fontSize: '13px', marginBottom: '16px' }}>{info}</div>)}

            {!otpSent ? (
              <button type="button" onClick={requestOtp} disabled={loading} style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#1e3a5f', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? '발송 중...' : '인증코드 받기'}
              </button>
            ) : (
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', background: loading ? '#9ca3af' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? '확인 중...' : '인증하고 로그인'}
              </button>
            )}
          </form>
        )}

        {/* 모드 전환 */}
        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => { setMode(mode === 'password' ? 'otp' : 'password'); setError(''); setInfo(''); setOtpSent(false); setCode(''); }}
            style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {mode === 'password' ? '비밀번호가 안 되나요? 이메일로 인증' : '← 비밀번호로 로그인'}
          </button>
        </div>

        <div style={{
          marginTop: '24px',
          paddingTop: '24px',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
          fontSize: '13px',
          color: '#9ca3af'
        }}>
          XinChao Vietnam Daily News System
        </div>
      </div>
    </div>
  );
}
