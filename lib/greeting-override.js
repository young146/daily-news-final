// ─────────────────────────────────────────────────────────────────────────────
//  인사말 사람 손질 — 자동 문구를 관리자가 고쳐 쓸 수 있게 한다
//
//  왜 (2026-09-04 사장님):
//    *"자동으로 넣은 문구를 작업자가 변경하거나 수정하도록 admin 에 관리 자리를
//      만드는 게 좋을 듯한데."*
//    규칙이 만든 문장은 대체로 맞지만, 그날의 사정(태풍·큰 사건·특별한 소식)은
//    사람만 안다. **자동을 기본으로 두되 사람이 덮어쓸 수 있어야 한다.**
//
//  저장: Setting 테이블 한 행(key='greetingOverride').
//    { date: 'YYYY-MM-DD', text: '...' }
//    ⚠️ **날짜를 함께 저장한다.** 안 그러면 어제 고쳐 둔 문구가 오늘도 나간다 —
//       "독립기념일 연휴 잘 보내셨나요?" 가 한 달 뒤에도 나가는 사고가 된다.
//       날짜가 오늘이 아니면 무시하고 자동 문구로 돌아간다.
//
//  DB 가 없거나 오류여도 **자동 문구로 폴백**한다 (메일 발송을 막지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
import prisma from './prisma.js';
import { buildGreeting } from './greeting.js';

const SETTING_KEY = 'greetingOverride';

/** 베트남 시간 기준 오늘 (발송이 베트남 아침에 나가므로 그 기준으로 맞춘다) */
export function todayVN(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
}

/** 저장된 손질 문구를 읽는다. 오늘 것이 아니면 null. */
export async function readOverride() {
  try {
    const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    if (!row?.value) return null;
    const saved = JSON.parse(row.value);
    if (!saved?.text || saved.date !== todayVN()) return null;   // 지난 날짜는 버린다
    return String(saved.text);
  } catch {
    return null;   // DB 문제로 발송을 막지 않는다
  }
}

/** 손질 문구를 저장한다. 빈 값을 주면 지운다(= 자동으로 되돌린다). */
export async function saveOverride(text) {
  const value = JSON.stringify({ date: todayVN(), text: String(text || '').trim() });
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    update: { value },
    create: { key: SETTING_KEY, value },
  });
}

/**
 * 실제로 메일에 나갈 인사말.
 * 사람이 고친 것이 있으면 그것을, 없으면 규칙이 만든 것을 쓴다.
 */
export async function resolveGreeting(opts) {
  const manual = await readOverride();
  return manual || buildGreeting(opts);
}
