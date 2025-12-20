/**
 * 베트남 시간대(Asia/Ho_Chi_Minh) 기준 날짜/시간 유틸리티 함수 (CommonJS)
 */

/**
 * 베트남 시간대 기준으로 현재 시간을 반환합니다.
 * @returns {Date} 베트남 시간대 기준 현재 시간 (UTC로 저장되지만 베트남 시간대의 값)
 */
function getVietnamTime() {
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

module.exports = {
  getVietnamTime
};

