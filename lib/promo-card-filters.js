// lib/promo-card-filters.js
// PromoCard 필터링 — 활성화(isActive) + 요일(weekdays) + 채널(channels) 조합 로직.
//
// 정책:
//   - isActive=false → 무조건 제외 (다른 필드 무관)
//   - weekdays 비어있음/null → 모든 요일 노출 (옛 카드 호환)
//   - weekdays 지정됨 → 지정된 요일에만 노출
//   - channels 비어있음/null → 모든 채널 노출 (옛 카드 호환)
//   - channels 지정됨 → 지정된 채널에만 노출
//
// weekdays CSV 형식: "1,3,5" — ISO 요일 (1=월 ~ 7=일)
// channels CSV 형식: "email,facebook,cardnews"
// 기준 시간대: Asia/Ho_Chi_Minh (UTC+7) — 모든 카드뉴스/이메일 발행 기준

/** Date → ISO 요일 (1=월 ~ 7=일), Asia/Ho_Chi_Minh 기준 */
export function getVietnamIsoWeekday(now = new Date()) {
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const day = vnNow.getDay(); // 0=일, 1=월, ..., 6=토
  return day === 0 ? 7 : day;
}

/** weekdays 만으로 오늘 요일 매칭 여부 (isActive 무시) */
export function matchesTodayWeekday(card, now = new Date()) {
  if (!card?.weekdays || !String(card.weekdays).trim()) return true; // 모든 요일
  const allowed = String(card.weekdays)
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n >= 1 && n <= 7);
  if (allowed.length === 0) return true; // 잘못된 값 = 모든 요일로 폴백 (안전)
  const today = getVietnamIsoWeekday(now);
  return allowed.includes(today);
}

/** channels 만으로 채널 매칭 여부 (isActive·요일 무시) */
export function matchesChannel(card, channel) {
  if (!channel) return true; // 채널 필터 미지정 = 통과
  if (!card?.channels || !String(card.channels).trim()) return true; // null/empty = 모든 채널
  const allowed = String(card.channels)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true; // 잘못된 값 = 모든 채널로 폴백 (안전)
  return allowed.includes(String(channel).toLowerCase());
}

/** 카드 한 장이 오늘 노출 가능한지 (isActive + 요일 + 채널 모두 충족)
 *  @param {object} card  PromoCard
 *  @param {Date}   now   기준 시각
 *  @param {string} [channel]  "email" | "facebook" | "cardnews" — 생략 시 채널 필터 미적용
 */
export function isCardAllowedToday(card, now = new Date(), channel = null) {
  if (!card?.isActive) return false;
  if (!matchesTodayWeekday(card, now)) return false;
  return matchesChannel(card, channel);
}

/** 카드 배열을 오늘 노출 가능한 것만으로 필터링 (옵션: 채널 필터) */
export function filterCardsForToday(cards, now = new Date(), channel = null) {
  return (cards || []).filter(c => isCardAllowedToday(c, now, channel));
}
