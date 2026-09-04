// ════════════════════════════════════════════════════════════════
//  구독자 이름 정규화 — 인사말에 쓸 수 있는 형태로 다듬는다
// ────────────────────────────────────────────────────────────────
//  왜 (2026-09-04 사장님): *"이메일과 이름이 함께 붙어 있는데, 수신자의 이름을
//  적고 감성적인 인사를 앞에 붙이는 것은 어떨까."*
//
//  그런데 명부의 이름은 표기가 제각각이다 (실측 6,386명):
//    "곽 성환"                      성과 이름 사이 공백  ← 가장 많다(4자 2,581명)
//    "함영숙 Ham Young Suk"          한글 + 로마자 병기
//    "SHIN DONG CHUL ( 신동철 )"     로마자 + 괄호 안 한글
//    "빵", "abraham@..."             쓸 수 없는 값
//
//  **이름을 잘못 부르면 안 부르느니만 못하다.** "SHIN DONG CHUL ( 신동철 ) 님,"
//  같은 인사는 성의 없어 보이고, 이메일 주소가 그대로 찍히면 사고다.
//  그래서 확신이 서는 것만 이름으로 쓰고, 나머지는 **이름 없는 인사**로 넘긴다.
// ════════════════════════════════════════════════════════════════

/** 한국 성씨 중 흔한 것 — "김 진영" 처럼 띄어 쓴 이름을 알아보는 데 쓴다 */
const SURNAMES = new Set([
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권',
  '황', '안', '송', '류', '유', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '노',
  '남', '심', '하', '곽', '성', '차', '주', '우', '구', '민', '나', '지', '엄', '채', '원',
  '천', '방', '공', '현', '함', '변', '염', '여', '추', '도', '소', '석', '선', '설', '마',
  '길', '연', '위', '표', '명', '기', '반', '왕', '금', '옥', '육', '인', '맹', '제', '탁',
]);

/** 이름으로 쓰면 안 되는 값 */
function isJunk(s) {
  if (!s) return true;
  if (s.includes('@')) return true;                 // 이메일 주소가 이름 칸에 들어간 것
  if (/^\d+$/.test(s)) return true;                 // 숫자만
  if (s.length < 2) return true;                    // 한 글자
  if (/(테스트|test|admin|없음|무명|user)/i.test(s)) return true;
  return false;
}

/**
 * 이름을 인사말에 쓸 형태로 다듬는다.
 * @returns {string} 쓸 수 있으면 다듬은 이름, 아니면 빈 문자열
 */
/** 회사·단체 이름으로 보이는가 — 사람에게 하는 인사에 쓰면 어색하다 */
const COMPANY = /\b(vina|corp|corporation|co\.?,?\s?ltd|ltd|inc|company|joint stock|jsc|group|tech|vietnam|holdings|trading|industr|electronics|construction|logistics)\b|[(),]/i;

export function normalizeName(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (isJunk(s)) return '';

  // ① 괄호 안에 한글이 있으면 그것이 본명이다 — "SHIN DONG CHUL ( 신동철 )" → "신동철"
  const paren = s.match(/[（(]\s*([가-힣]{2,5})\s*[）)]/);
  if (paren) return paren[1];

  // ② 뒤에 붙은 직함 괄호를 떼어 낸다 — "Park Hyung Jun (Director)" → "Park Hyung Jun"
  //    (괄호 안에 한글 이름이 있는 경우는 위 ①에서 이미 걸러졌다)
  s = s.replace(/\s*[（(][^)）]*[）)]\s*$/, '').trim();

  // ③ 한글과 로마자가 섞여 있으면 한글만 취한다 — "함영숙 Ham Young Suk" → "함영숙"
  //    ⚠️ **성이 떨어져 나가지 않게** 「성 + 공백 + 이름」을 먼저 본다.
  //       (2026-09-04 실측 버그: "박 준용 Yong" 이 "준용" 이 됐다 — 성을 잃으면 남을 부르는 셈이다)
  if (/[가-힣]/.test(s) && /[A-Za-z]/.test(s)) {
    const spaced = s.match(/([가-힣])\s([가-힣]{1,3})/);       // "박 준용"
    const joined = s.match(/[가-힣]{2,5}/);                    // "함영숙"
    if (spaced && SURNAMES.has(spaced[1])) s = spaced[1] + spaced[2];
    else if (joined) s = joined[0];
  }

  // ④ 한글 이름의 공백을 붙인다 — "곽 성환" → "곽성환"
  //    단, 첫 글자가 흔한 성씨일 때만. 아니면 별명·문구일 수 있다.
  if (/^[가-힣]\s[가-힣]{1,3}$/.test(s) && SURNAMES.has(s[0])) {
    s = s.replace(/\s/g, '');
  }

  // ⑤ 깔끔한 한글 이름이면 통과
  if (/^[가-힣]{2,5}$/.test(s)) return s;

  // ⑥ 로마자 — 회사 이름으로 보이면 쓰지 않는다.
  //    "ALPS ALPINE Vietnam 님, 안녕하세요" 는 사람에게 하는 인사가 아니다.
  if (COMPANY.test(s)) return '';

  //    호칭이 붙었으면 사람이 분명하다 — "Ms.Hien" → "Hien"
  const titled = s.match(/^(?:Mr|Ms|Mrs|Miss|Dr)\.?\s*([A-Za-z][A-Za-z'-]{1,20})$/i);
  if (titled) {
    const t = titled[1].toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  //    ⚠️ **한 단어짜리 영문은 쓰지 않는다** (2026-09-04 사장님 결정).
  //       94명을 실제로 뽑아 보니 대부분 사람이 아니라 **회사 약칭**이었다:
  //         VPMilk · V.P.E · VIKOKOREA · NRBFLEX · YNC · PRINTLOGIC · SMCITY · BEXCO
  //       "Eric" 같은 진짜 이름도 섞여 있지만, 회사를 사람처럼 부르는 쪽이 더 나쁘다.
  //       (사장님 본인 기록도 회사 명부에서 옮겨 심느라 이름이 "Eric" 으로 들어가 있었다)
  //       전체의 1.4% 라 손해도 작다 — **이름 없이 인사하는 편이 안전하다.**
  if (!/\s/.test(s)) return '';

  //    두 단어 이상이면 사람 이름으로 본다 — "KIM MINSU" → "Kim Minsu".
  //    단어 4개를 넘으면 이름이 아닐 가능성이 높다.
  if (/^[A-Za-z][A-Za-z .'-]{1,30}$/.test(s) && s.split(' ').length <= 4) {
    return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();
  }

  // ⑦ 그 밖에는 **쓰지 않는다.** 잘못 부르느니 안 부르는 게 낫다.
  return '';
}

/**
 * 인사말 첫 줄을 만든다.
 * 이름이 없으면 이름 없는 인사로 자연스럽게 넘어간다 — 빈칸이나 "님," 만 남으면 안 된다.
 */
export function greetingName(raw) {
  const n = normalizeName(raw);
  return n ? `${n} 님` : '';
}
