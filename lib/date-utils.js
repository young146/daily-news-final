/**
 * 베트남 시간대(Asia/Ho_Chi_Minh) 기준 날짜/시간 유틸리티 함수
 */

/**
 * 베트남 시간대 기준으로 현재 시간을 반환합니다.
 * @returns {Date} 베트남 시간대 기준 현재 시간 (UTC로 저장되지만 베트남 시간대의 값)
 */
export function getVietnamTime() {
  const now = new Date();
  // 베트남 시간대(UTC+7)의 현재 시간을 UTC Date 객체로 변환
  const vietnamTimeStr = now.toLocaleString("en-US", { 
    timeZone: "Asia/Ho_Chi_Minh",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // "MM/DD/YYYY, HH:mm:ss" 형식을 파싱
  const [datePart, timePart] = vietnamTimeStr.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hours, minutes, seconds] = timePart.split(':');
  
  // 베트남 시간대로 Date 객체 생성 (UTC로 저장되지만 값은 베트남 시간)
  return new Date(Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
    parseInt(seconds || 0)
  ));
}

/**
 * 베트남 시간대 기준으로 오늘 날짜의 시작 시간(00:00:00)을 반환합니다.
 * @returns {Date} 베트남 시간대 기준 오늘 00:00:00
 */
export function getVietnamToday() {
  const vietnamTime = getVietnamTime();
  // UTC 메서드를 사용하여 날짜 추출 (getVietnamTime()이 UTC로 저장된 베트남 시간이므로)
  const today = new Date(Date.UTC(
    vietnamTime.getUTCFullYear(),
    vietnamTime.getUTCMonth(),
    vietnamTime.getUTCDate(),
    0, 0, 0, 0
  ));
  return today;
}

/**
 * 베트남 시간대 기준으로 날짜 문자열을 반환합니다.
 * @param {Date} date - 날짜 객체 (선택사항, 없으면 현재 시간)
 * @param {string} format - 포맷 ('YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss' 등)
 * @returns {string} 포맷된 날짜 문자열
 */
export function formatVietnamDate(date = null, format = 'YYYY-MM-DD') {
  const vietnamTime = date ? new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
  ) : getVietnamTime();
  
  const year = vietnamTime.getFullYear();
  const month = String(vietnamTime.getMonth() + 1).padStart(2, "0");
  const day = String(vietnamTime.getDate()).padStart(2, "0");
  const hours = String(vietnamTime.getHours()).padStart(2, "0");
  const minutes = String(vietnamTime.getMinutes()).padStart(2, "0");
  const seconds = String(vietnamTime.getSeconds()).padStart(2, "0");
  
  if (format === 'YYYY-MM-DD') {
    return `${year}-${month}-${day}`;
  } else if (format === 'YYYY-MM-DD HH:mm:ss') {
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } else if (format === 'MMDD') {
    return `${month}${day}`;
  }
  
  return `${year}-${month}-${day}`;
}

/**
 * 베트남 시간대 기준으로 날짜를 로컬화된 문자열로 반환합니다.
 * @param {Date} date - 날짜 객체
 * @param {object} options - toLocaleDateString 옵션
 * @returns {string} 로컬화된 날짜 문자열
 */
export function formatVietnamDateLocale(date, options = {}) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Ho_Chi_Minh',
    ...options
  });
}

