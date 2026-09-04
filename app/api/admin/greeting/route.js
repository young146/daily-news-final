import { NextResponse } from 'next/server';
import { buildGreeting } from '../../../../lib/greeting.js';
import { readOverride, saveOverride, todayVN } from '../../../../lib/greeting-override.js';

export const dynamic = 'force-dynamic';

// ── 뉴스레터 인사말 — 읽기·저장 (관리 화면용) ────────────────────────
//  GET  → { date, auto, manual, effective }
//         auto      규칙이 만든 오늘 문구
//         manual    사람이 고쳐 저장한 문구 (없으면 null)
//         effective 실제로 메일에 나갈 문구
//  POST { text } → 저장. 빈 문자열이면 지우고 자동으로 되돌린다.
//
//  ⚠️ 저장은 **오늘 날짜로만** 유효하다. 어제 고친 문구가 오늘 나가면
//     "독립기념일 연휴 잘 보내셨나요?" 가 한 달 뒤에도 나가는 사고가 된다.

export async function GET() {
  try {
    const auto = buildGreeting();
    const manual = await readOverride();
    return NextResponse.json({
      success: true,
      date: todayVN(),
      auto,
      manual,
      effective: manual || auto,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = String(body.text ?? '').trim();
    if (text.length > 300) {
      return NextResponse.json(
        { success: false, error: '인사말이 너무 깁니다 (300자 이내).' },
        { status: 400 },
      );
    }
    await saveOverride(text);
    const auto = buildGreeting();
    const manual = await readOverride();
    return NextResponse.json({
      success: true,
      saved: !!text,
      date: todayVN(),
      auto,
      manual,
      effective: manual || auto,
      message: text ? '인사말을 저장했습니다. 오늘 발송에 이 문구가 나갑니다.'
                    : '손질을 지웠습니다. 자동 문구로 돌아갑니다.',
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err?.message || err) }, { status: 500 });
  }
}
