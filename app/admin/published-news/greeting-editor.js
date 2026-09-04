'use client';

import { useEffect, useState } from 'react';

// ── 오늘 나갈 인사말 — 보고 고치는 자리 ──────────────────────────────
//  왜 (2026-09-04 사장님):
//    *"AI 가 자동으로 넣은 문구를 작업자가 변경하거나 수정하도록 admin 에
//      관리 자리를 만드는 게 좋을 듯한데."*
//
//  자동 문구는 규칙(연휴·공휴일·요일·날씨)이 만든다. 대체로 맞지만 **그날의 사정**
//  (태풍, 큰 사건, 특별한 소식)은 사람만 안다. 그래서 자동을 기본으로 두되
//  **사람이 덮어쓸 수 있게** 한다.
//
//  ⚠️ 손질은 **오늘 하루만** 유효하다 — 어제 고친 문구가 오늘 나가면
//     "연휴 잘 보내셨나요?" 가 한 달 뒤에도 나가는 사고가 된다.
//     날짜가 바뀌면 자동으로 규칙 문구로 돌아간다.
export default function GreetingEditor({ showToast }) {
  const [state, setState] = useState(null);   // { date, auto, manual, effective }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const r = await fetch('/api/admin/greeting');
      const j = await r.json();
      if (j.success) {
        setState(j);
        setText(j.manual || j.auto || '');
      }
    } catch (_) { /* 화면만 비어 보일 뿐, 발송에는 영향 없다 */ }
  };

  useEffect(() => { load(); }, []);

  const save = async (value) => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      });
      const j = await r.json();
      if (j.success) {
        setState(j);
        setText(j.manual || j.auto || '');
        showToast?.(`✅ ${j.message}`);
      } else {
        showToast?.(`❌ ${j.error}`, 'error');
      }
    } catch (e) {
      showToast?.(`❌ 오류: ${e.message}`, 'error');
    }
    setBusy(false);
  };

  if (!state) return null;

  const edited = !!state.manual;
  const dirty = text.trim() !== (state.manual || state.auto || '').trim();

  return (
    <div style={{
      border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px',
      background: '#FFFDFB', margin: '12px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>오늘 메일 첫 줄 (인사말)</strong>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 999,
          background: edited ? '#FEF3C7' : '#E0F2FE',
          color: edited ? '#92400E' : '#075985',
        }}>
          {edited ? '사람이 고침' : '자동'}
        </span>
        <span style={{ fontSize: 11, color: '#94A3B8' }}>{state.date}</span>
        <button type="button" onClick={() => setOpen(!open)}
          style={{ marginLeft: 'auto', fontSize: 12, background: 'none', border: 'none',
                   color: '#0369A1', cursor: 'pointer' }}>
          {open ? '접기' : '고치기'}
        </button>
      </div>

      {/* 받는 사람에게 보이는 모습.
          ⚠️ 이름은 **예시**임을 눈에 띄게 표시한다 — 안 그러면 "홍길동 님"이
             실제로 나가는 줄 알고 놀란다 (2026-09-04 사장님 실제 반응). */}
      <div style={{
        marginTop: 10, padding: '10px 12px', background: '#FFF', borderRadius: 8,
        border: '1px solid #F1F5F9', fontSize: 14, lineHeight: 1.7, color: '#231A14',
      }}>
        <span style={{
          background: '#FEF9C3', color: '#854D0E', borderRadius: 4, padding: '1px 4px',
          fontWeight: 700, borderBottom: '1px dashed #CA8A04',
        }}>홍길동 님</span>, {state.effective}
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 5, lineHeight: 1.6 }}>
        노란 칠은 <strong>예시</strong>입니다 — 실제로는 받는 분 이름이 들어가고,
        이름을 모르는 분께는 이름 없이 인사말만 나갑니다.
        <br />
        SMTP(BCC) 발송은 한 통을 여럿에게 함께 보내는 방식이라 <strong>이름이 붙지 않습니다</strong>.
        이름을 넣으려면 e-service 로 보내세요.
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={300}
            style={{
              width: '100%', padding: 10, borderRadius: 8, border: '1px solid #CBD5E1',
              fontSize: 14, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical',
            }}
            placeholder="예) 태풍이 지나갔습니다. 피해 없으셨는지요."
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button type="button" disabled={busy || !dirty} onClick={() => save(text)}
              style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13,
                background: dirty ? '#F97316' : '#E2E8F0',
                color: dirty ? '#fff' : '#94A3B8',
                cursor: dirty && !busy ? 'pointer' : 'default',
              }}>
              {busy ? '저장 중…' : '저장'}
            </button>
            {edited && (
              <button type="button" disabled={busy} onClick={() => save('')}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: '1px solid #CBD5E1',
                  fontSize: 13, background: '#fff', color: '#475569', cursor: 'pointer',
                }}>
                자동으로 되돌리기
              </button>
            )}
            <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
              {text.length}/300자 · 오늘 하루만 적용됩니다
            </span>
          </div>
          {edited && (
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 8 }}>
              자동 문구: {state.auto}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
