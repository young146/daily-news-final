// ════════════════════════════════════════════════════════════════
//  데일리뉴스 인사말 — 그날의 사정을 담은 첫 줄
// ────────────────────────────────────────────────────────────────
//  왜 (2026-09-04 사장님):
//    *"그냥 여기 뉴스 있다 봐라 하는 정도니까. 감성적으로 접근하는 자세가
//      호감을 주지 못하는 것 같아."*
//    예시로 주신 문장:
//      「000 님, 독립기념일 연휴 잘 보내셨나요?
//        다시 시작하는 베트남의 일상, 씬짜오 데일리 뉴스로 문을 열어보세요」
//    → **시사성이 없으면 의미가 없다.** 날짜만 바뀌는 상투어라면 안 하느니만 못하다.
//
//  그래서 이 파일은 **그날 실제로 일어난 일**만 근거로 삼는다:
//    ① 베트남·한국 공휴일과 연휴 (달력)
//    ② 오늘 날씨 (뉴스 터미널이 이미 받아오는 실측값)
//    ③ 요일·계절
//  ⚠️ 지어내지 않는다. 근거가 없으면 **담백한 기본 인사**로 물러선다.
//     거짓 감성은 호감이 아니라 불신을 만든다.
// ════════════════════════════════════════════════════════════════

/**
 * 베트남·한국의 주요 공휴일. `md` 는 양력 월-일.
 * 음력(설·추석·훙왕기일)은 해마다 달라 `lunar` 에 연도별로 적는다.
 *   who: 'vn' 베트남 | 'kr' 한국 | 'both'
 */
const FIXED = [
  { md: '01-01', who: 'both', name: '새해' },
  { md: '03-08', who: 'vn', name: '세계 여성의 날', light: true },
  { md: '04-30', who: 'vn', name: '남부 해방 기념일' },
  { md: '05-01', who: 'both', name: '노동절' },
  { md: '06-06', who: 'kr', name: '현충일' },
  { md: '08-15', who: 'kr', name: '광복절' },
  { md: '09-02', who: 'vn', name: '독립기념일' },
  { md: '10-03', who: 'kr', name: '개천절' },
  { md: '10-20', who: 'vn', name: '베트남 여성의 날', light: true },
  { md: '11-20', who: 'vn', name: '스승의 날', light: true },
  { md: '12-25', who: 'both', name: '성탄절' },
];

// 음력 명절 — 해마다 양력 날짜가 달라 직접 적는다. **해가 바뀌면 여기를 채워야 한다.**
const LUNAR = {
  2026: [
    { date: '2026-02-17', who: 'vn', name: '뗏(설날)', long: true },
    { date: '2026-02-17', who: 'kr', name: '설날', long: true },
    { date: '2026-04-26', who: 'vn', name: '훙왕 기일' },
    { date: '2026-09-25', who: 'kr', name: '추석', long: true },
  ],
  2027: [
    { date: '2027-02-06', who: 'vn', name: '뗏(설날)', long: true },
    { date: '2027-02-06', who: 'kr', name: '설날', long: true },
    { date: '2027-04-16', who: 'vn', name: '훙왕 기일' },
    { date: '2027-09-15', who: 'kr', name: '추석', long: true },
  ],
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayDiff = (a, b) => Math.round((a - b) / 86400000);

/** 그날 기준으로 가까운 공휴일을 찾는다 (지난 3일 ~ 앞으로 3일) */
function nearbyHoliday(today) {
  const out = [];
  for (let off = -4; off <= 3; off++) {
    const d = new Date(today);
    d.setDate(d.getDate() + off);
    const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    for (const h of FIXED) if (h.md === md) out.push({ ...h, offset: -off, date: ymd(d) });
    for (const h of (LUNAR[d.getFullYear()] || [])) {
      if (h.date === ymd(d)) out.push({ ...h, offset: -off, date: h.date });
    }
  }
  // offset: 양수 = 며칠 전에 지났다, 0 = 오늘, 음수 = 며칠 뒤
  out.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));
  return out[0] || null;
}

/** 연휴 뒤 첫 출근일인가 — 월요일이거나, 공휴일이 2~4일 전이면서 오늘이 평일 */
function isBackToWork(today, holiday) {
  const dow = today.getDay();               // 0 일 ~ 6 토
  if (dow === 0 || dow === 6) return false;
  return holiday && holiday.offset >= 1 && holiday.offset <= 4;
}

/**
 * 인사말 본문을 만든다 (이름은 부르는 쪽에서 앞에 붙인다).
 *
 * @param {object} opt
 *   now      Date (기본 오늘)
 *   weather  { hanoi, hcmc, seoul } 섭씨 숫자 — 없으면 날씨 이야기를 안 한다
 * @returns {string} 한 문장~두 문장. 근거가 없으면 담백한 기본 인사.
 */
export function buildGreeting({ now = new Date(), weather = null } = {}) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();
  const h = nearbyHoliday(today);

  // ① 연휴가 막 끝났다 — 사장님이 예시로 주신 바로 그 상황
  if (isBackToWork(today, h) && (h.long || h.offset >= 2)) {
    return `${h.name} 연휴 잘 보내셨나요? 다시 시작하는 베트남의 일상, `
         + `씬짜오 데일리 뉴스로 문을 열어 보세요.`;
  }
  // ② 오늘이 공휴일
  if (h && h.offset === 0) {
    return h.light
      ? `오늘은 ${h.name}입니다. 가까운 분께 안부 한마디 건네기 좋은 날입니다.`
      : `오늘은 ${h.name}입니다. 쉬시는 중에도 베트남 소식은 챙겨 두세요.`;
  }
  // ③ 공휴일이 코앞 (내일·모레)
  if (h && h.offset <= -1 && h.offset >= -2) {
    return `${h.name}이 코앞입니다. 연휴 전에 챙겨 둘 소식을 모았습니다.`;
  }
  // ④ 요일의 결 + 날씨 (있을 때만)
  const w = weatherLine(weather);
  if (dow === 1) return `새 한 주가 시작됐습니다.${w} 오늘의 베트남 소식입니다.`;
  if (dow === 5) return `한 주의 끝입니다.${w} 주말 전에 챙겨 둘 소식을 모았습니다.`;
  if (dow === 6 || dow === 0) return `주말입니다.${w} 천천히 읽어 보실 소식을 준비했습니다.`;
  return `오늘도 문을 엽니다.${w} 베트남의 아침 소식입니다.`;
}

/** 날씨 한 조각 — 숫자가 없으면 아무 말도 하지 않는다 (지어내지 않는다) */
function weatherLine(w) {
  if (!w) return '';
  const hcmc = Number(w.hcmc);
  const hanoi = Number(w.hanoi);
  if (Number.isFinite(hcmc) && Number.isFinite(hanoi)) {
    return ` 오늘 하노이 ${Math.round(hanoi)}도, 호치민 ${Math.round(hcmc)}도입니다.`;
  }
  if (Number.isFinite(hcmc)) return ` 오늘 호치민은 ${Math.round(hcmc)}도입니다.`;
  return '';
}

/**
 * 받는 사람 이름을 앞에 붙인 완성된 인사.
 * 이름이 없으면 **자연스럽게 이름 없이** 시작한다 — "님," 만 남으면 안 된다.
 */
export function personalGreeting(nameOrEmpty, opts) {
  const body = buildGreeting(opts);
  return nameOrEmpty ? `${nameOrEmpty}, ${body}` : body;
}
