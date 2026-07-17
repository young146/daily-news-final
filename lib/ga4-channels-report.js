// 🔍 [측정] 유입 채널별(구글/네이버/직접/SNS) 방문 — GA4 기반.
// 네이버는 검색노출 API를 안 주므로, "네이버가 실제로 보낸 방문 수"를 GA4로 잡아
// 구글·직접 등과 함께 주간 리포트에 보여준다. (기존 GA4 리포트의 채널쿼리는 이메일/카톡만
// 필터하므로 검색엔진 유입을 못 잡음 → 이 모듈이 전체 소스를 버킷으로 묶어 보완)
import { runReport, resolvePropertyId } from './ga4-report.js';

const THIS_WEEK = { startDate: '7daysAgo', endDate: 'yesterday' };
const PRIOR_WEEK = { startDate: '14daysAgo', endDate: '8daysAgo' };

// 원본 sessionSource 값을 사람이 읽는 버킷으로 묶음
function bucket(src) {
  const s = (src || '').toLowerCase();

  // 📧 이메일 — 반드시 'google' 규칙보다 먼저. 데일리 뉴스레터가 최대 유입 채널인데
  // 여기에 규칙이 없어서 통째로 '기타'로 떨어지고 있었다(2026-07-17까지).
  // 'sendgrid.com' 도 같은 버킷: SendGrid 가 자체 추적으로 우리 utm_source=email 을
  // utm_source=sendgrid.com 으로 덮어써서 남남처럼 보였다. 발송코드에서 추적을 껐으므로
  // 앞으로는 email 로 들어오지만, 과거분·잔여분을 함께 세려면 두 값을 묶어야 한다.
  // (실측: sendgrid.com 7,861 + email 1,010 세션/28일. 이메일 미발송일인 일요일에
  //  sendgrid 유입이 329 -> 11 로 사라지는 것으로 동일 채널임을 확정)
  if (s === 'email' || s.includes('sendgrid') || s.includes('newsletter')) return '이메일';

  // 📱 구글플레이 스토어 유입은 '검색'이 아니라 앱 설치 동선이다. 아래 google 규칙에
  // 먼저 걸리면 '구글 검색'으로 잘못 집계된다.
  if (s.includes('google-play') || s.includes('play.google')) return '구글플레이(앱)';

  // 🔗 앱 공유버튼에서 나간 링크 (utm_source, deepLinkUtils.js PLATFORM_TO_UTM_SOURCE).
  // 반드시 아래 daum/kakao·facebook 규칙보다 먼저 — 안 그러면 카톡 '공유' 유입이
  // 다음/카카오 '검색' 유입과 한 덩어리가 돼 기여도를 못 가른다.
  if (s === 'kakaotalk') return '카톡 공유';
  if (s === 'sharesheet') return '공유(대상불명)';

  if (s.includes('google')) return '구글 검색';
  if (s.includes('naver')) return '네이버';
  if (s === '(direct)' || s === 'direct' || s === '(none)') return '직접 방문';
  if (s.includes('daum') || s.includes('kakao')) return '다음/카카오';
  if (s.includes('facebook') || s === 'fb' || s.includes('instagram') || s === 'l.facebook.com') return 'SNS(페북/인스타)';
  if (s.includes('zalo')) return 'Zalo';
  if (s.includes('bing')) return 'Bing';
  if (s.includes('yahoo')) return 'Yahoo';
  return '기타';
}

async function sourcesByWeek(propertyId, range) {
  const resp = await runReport(propertyId, {
    dateRanges: [range],
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 200,
  });
  const map = {};
  for (const r of resp.rows || []) {
    const b = bucket(r.dimensionValues[0].value);
    map[b] = (map[b] || 0) + Number(r.metricValues[0].value || 0);
  }
  return map;
}

export async function fetchChannelBreakdown() {
  try {
    const propertyId = await resolvePropertyId();
    const [cur, prev] = await Promise.all([
      sourcesByWeek(propertyId, THIS_WEEK),
      sourcesByWeek(propertyId, PRIOR_WEEK),
    ]);
    const keys = Array.from(new Set([...Object.keys(cur), ...Object.keys(prev)]));
    const rows = keys
      .map((k) => ({ channel: k, sessions: cur[k] || 0, prior: prev[k] || 0 }))
      .sort((a, b) => b.sessions - a.sessions);
    const total = rows.reduce((n, r) => n + r.sessions, 0);
    return { ok: true, rows, total };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── HTML 조각 ──────────────────────────────────────────────
const int = (n) => Math.round(n).toLocaleString('ko-KR');
function wow(cur, prev) {
  if (!prev) return '<span style="color:#888">신규</span>';
  const ch = (cur - prev) / prev * 100;
  const up = ch >= 0;
  return `<span style="color:${up ? '#16a34a' : '#dc2626'}">${up ? '▲' : '▼'} ${Math.abs(ch).toFixed(0)}%</span>`;
}

export function buildChannelHtml(cb) {
  if (!cb || !cb.ok) {
    return `<div style="margin:24px 16px;padding:14px;border:1px dashed #f59e0b;border-radius:8px;background:#fffbeb;font-family:sans-serif;color:#92400e;font-size:13px">
      🌐 유입 채널 데이터를 못 가져왔어요: ${cb?.error || '알 수 없음'}</div>`;
  }
  const rows = cb.rows.map((r) => {
    const share = cb.total ? Math.round(r.sessions / cb.total * 100) : 0;
    return `<tr style="border-bottom:1px solid #f1f1f1">
      <td style="padding:6px 8px">${r.channel}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:bold">${int(r.sessions)}</td>
      <td style="padding:6px 8px;text-align:right;color:#888">${share}%</td>
      <td style="padding:6px 8px;text-align:right">${wow(r.sessions, r.prior)}</td>
    </tr>`;
  }).join('');
  return `<div style="margin:24px 16px;font-family:sans-serif">
    <h2 style="font-size:18px;border-bottom:2px solid #2563eb;padding-bottom:6px">🌐 유입 채널별 방문 <span style="font-size:12px;color:#888;font-weight:normal">(최근 7일 · 세션 기준)</span></h2>
    <div style="font-size:12px;color:#888;margin:4px 0 8px">사람들이 어디를 통해 우리 사이트에 오나 — 구글/네이버/직접/SNS</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="color:#888;border-bottom:1px solid #eee">
        <td style="padding:6px 8px">채널</td>
        <td style="padding:6px 8px;text-align:right">방문(세션)</td>
        <td style="padding:6px 8px;text-align:right">비중</td>
        <td style="padding:6px 8px;text-align:right">전주대비</td>
      </tr>
      ${rows || '<tr><td colspan="4" style="padding:8px;color:#888">데이터 없음</td></tr>'}
    </table>
  </div>`;
}
