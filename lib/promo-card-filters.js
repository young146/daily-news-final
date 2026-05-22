// lib/promo-card-filters.js
// PromoCard 필터링 — 활성화(isActive)와 요일(weekdays) 조합 로직.
//
// 정책:
//   - isActive=false → 무조건 제외 (요일 무관)
//   - isActive=true + weekdays 비어있음/null → 모든 요일 노출 (기본)
//   - isActive=true + weekdays 지정됨 → 지정된 요일에만 노출
//
// weekdays CSV 형식: "1,3,5" — ISO 요일 (1=월 ~ 7=일)
// 기준 시간대: Asia/Ho_Chi_Minh (UTC+7) — 모든 카드뉴스/이메일 발행 기준

/** Date → ISO 요일 (1=월 ~ 7=일), Asia/Ho_Chi_Minh 기준 */
export function getVietnamIsoWeekday(now = new Date()) {
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const day = vnNow.getDay(); // 0=일, 1=월, ..., 6=토
  return day === 0 ? 7 : day;
}

/** 카드 한 장이 오늘 노출 가능한지 */
export function isCardAllowedToday(card, now = new Date()) {
  if (!card?.isActive) return false;
  if (!card.weekdays || !String(card.weekdays).trim()) return true; // 모든 요일
  const allowed = String(card.weekdays)
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n >= 1 && n <= 7);
  if (allowed.length === 0) return true; // 잘못된 값 = 모든 요일로 폴백 (안전)
  const today = getVietnamIsoWeekday(now);
  return allowed.includes(today);
}

/** 카드 배열을 오늘 노출 가능한 것만으로 필터링 */
export function filterCardsForToday(cards, now = new Date()) {
  return (cards || []).filter(c => isCardAllowedToday(c, now));
}
