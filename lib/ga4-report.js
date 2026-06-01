// 🔍 [측정 인프라 Phase 5 — 코드형 주간 리포트]
// GA4 Data API 로 핵심 KPI 를 끌어와 주간 보고 HTML 을 만든다.
// 인증: 기존 Firebase Admin 서비스계정(GOOGLE_APPLICATION_CREDENTIALS) 재사용.
// 필요한 1회 콘솔 작업:
//   1) GCP 프로젝트(chaovietnam-login)에서 "Google Analytics Data API" + "Admin API" 사용 설정
//   2) GA4 속성 액세스 관리에서 서비스계정 이메일을 '뷰어' 로 추가
//   3) (선택) .env 에 GA4_PROPERTY_ID 지정 — 미지정 시 measurement ID 로 자동 탐색

import { GoogleAuth } from 'google-auth-library';

const MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID || 'G-QTCWJ6GGH0';
const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

// 측정하려는 커스텀 이벤트 6종 (앱)
const CUSTOM_EVENTS = [
    'magazine_open', 'news_read', 'job_view',
    'realestate_view', 'signup_complete', 'share_clicked',
];

let _authClient = null;
async function getToken() {
    if (!_authClient) {
        // keyFile 은 GOOGLE_APPLICATION_CREDENTIALS 가 있으면 자동 사용
        _authClient = await new GoogleAuth({ scopes: SCOPES }).getClient();
    }
    const { token } = await _authClient.getAccessToken();
    if (!token) throw new Error('GA4 액세스 토큰 발급 실패 (서비스계정/권한 확인)');
    return token;
}

// measurement ID → 숫자 property ID 자동 탐색 (Admin API). env 지정이 우선.
let _cachedPropertyId = null;
export async function resolvePropertyId() {
    if (process.env.GA4_PROPERTY_ID) {
        const v = String(process.env.GA4_PROPERTY_ID).replace(/^properties\//, '');
        return `properties/${v}`;
    }
    if (_cachedPropertyId) return _cachedPropertyId;

    const token = await getToken();
    const sumRes = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!sumRes.ok) {
        const body = await sumRes.text();
        throw new Error(`property 자동탐색 실패(${sumRes.status}). GA4_PROPERTY_ID 를 .env 에 직접 지정하세요. ${body.slice(0, 200)}`);
    }
    const sum = await sumRes.json();
    for (const acc of sum.accountSummaries || []) {
        for (const p of acc.propertySummaries || []) {
            const dsRes = await fetch(`https://analyticsadmin.googleapis.com/v1beta/${p.property}/dataStreams`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!dsRes.ok) continue;
            const ds = await dsRes.json();
            for (const s of ds.dataStreams || []) {
                if (s.webStreamData?.measurementId === MEASUREMENT_ID) {
                    _cachedPropertyId = p.property;
                    return p.property;
                }
            }
        }
    }
    throw new Error(`measurement ID ${MEASUREMENT_ID} 에 해당하는 GA4 속성을 못 찾음. GA4_PROPERTY_ID 직접 지정 필요.`);
}

async function runReport(propertyId, body) {
    const token = await getToken();
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const t = await res.text();
        throw new Error(`runReport 실패(${res.status}): ${t.slice(0, 300)}`);
    }
    return res.json();
}

const THIS_WEEK = { startDate: '7daysAgo', endDate: 'yesterday', name: 'thisWeek' };
const PRIOR_WEEK = { startDate: '14daysAgo', endDate: '8daysAgo', name: 'priorWeek' };

// 두 기간 비교용 총계 추출 헬퍼
function pickByRange(resp, metricIndex) {
    const out = { thisWeek: 0, priorWeek: 0 };
    for (const row of resp.rows || []) {
        // dateRange 에 name 을 주면 차원값이 그 이름('thisWeek'/'priorWeek')으로 옴
        const rangeName = row.dimensionValues?.[0]?.value;
        const val = Number(row.metricValues?.[metricIndex]?.value || 0);
        if (rangeName === 'thisWeek' || rangeName === 'date_range_0') out.thisWeek = val;
        else if (rangeName === 'priorWeek' || rangeName === 'date_range_1') out.priorWeek = val;
    }
    return out;
}

export async function fetchWeeklyKpis() {
    const propertyId = await resolvePropertyId();

    // 1) 핵심 총계 (이번주 vs 지난주)
    // 다중 dateRanges 사용 시 'dateRange' 차원은 응답에 자동 추가됨 (dimensions 에 넣으면 400)
    const totalsResp = await runReport(propertyId, {
        dateRanges: [THIS_WEEK, PRIOR_WEEK],
        metrics: [
            { name: 'totalUsers' }, { name: 'newUsers' },
            { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'eventCount' },
        ],
    });
    const totals = {
        totalUsers: pickByRange(totalsResp, 0),
        newUsers: pickByRange(totalsResp, 1),
        sessions: pickByRange(totalsResp, 2),
        screenPageViews: pickByRange(totalsResp, 3),
        eventCount: pickByRange(totalsResp, 4),
    };

    // 2) 앱 신규 설치 (first_open) 이번주 vs 지난주
    const installResp = await runReport(propertyId, {
        dateRanges: [THIS_WEEK, PRIOR_WEEK],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'first_open' } } },
    });
    const installs = pickByRange(installResp, 0);

    // 3) 채널별(이메일/카톡) 유입 — 이번주
    const channelResp = await runReport(propertyId, {
        dateRanges: [THIS_WEEK],
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        dimensionFilter: {
            filter: { fieldName: 'sessionSource', inListFilter: { values: ['email', 'kakao', 'newsletter'] } },
        },
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 25,
    });
    const channels = (channelResp.rows || []).map((r) => ({
        source: r.dimensionValues[0].value,
        medium: r.dimensionValues[1].value,
        sessions: Number(r.metricValues[0].value || 0),
        users: Number(r.metricValues[1].value || 0),
    }));

    // 4) 플랫폼별 사용자 — 이번주
    const platformResp = await runReport(propertyId, {
        dateRanges: [THIS_WEEK],
        dimensions: [{ name: 'platform' }],
        metrics: [{ name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
    });
    const platforms = (platformResp.rows || []).map((r) => ({
        platform: r.dimensionValues[0].value,
        users: Number(r.metricValues[0].value || 0),
    }));

    // 5) 커스텀 이벤트 6종 카운트 — 이번주
    const eventsResp = await runReport(propertyId, {
        dateRanges: [THIS_WEEK],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: CUSTOM_EVENTS } } },
        orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    });
    const events = (eventsResp.rows || []).map((r) => ({
        name: r.dimensionValues[0].value,
        count: Number(r.metricValues[0].value || 0),
    }));

    // 6) 일별 활성 사용자 추이 — 이번주
    const dauResp = await runReport(propertyId, {
        dateRanges: [THIS_WEEK],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
    });
    const dau = (dauResp.rows || []).map((r) => ({
        date: r.dimensionValues[0].value,
        users: Number(r.metricValues[0].value || 0),
    }));

    return { propertyId, totals, installs, channels, platforms, events, dau };
}

// ── HTML 보고서 ────────────────────────────────────────────────
function delta(cur, prev) {
    if (!prev) return cur > 0 ? '신규' : '–';
    const pct = ((cur - prev) / prev) * 100;
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '–';
    const color = pct > 0 ? '#16a34a' : pct < 0 ? '#dc2626' : '#6b7280';
    return `<span style="color:${color}">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
}
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const EVENT_LABEL = {
    magazine_open: '매거진 열람', news_read: '뉴스 읽음', job_view: '구인 조회',
    realestate_view: '부동산 조회', signup_complete: '가입 완료', share_clicked: '공유 클릭',
};

export function buildReportHtml(kpis) {
    const { totals, installs, channels, platforms, events, dau } = kpis;
    const card = (label, t) => `
      <td style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;vertical-align:top">
        <div style="font-size:12px;color:#6b7280">${label}</div>
        <div style="font-size:24px;font-weight:700;color:#111827;margin-top:4px">${fmt(t.thisWeek)}</div>
        <div style="font-size:12px;margin-top:2px">${delta(t.thisWeek, t.priorWeek)} <span style="color:#9ca3af">(지난주 ${fmt(t.priorWeek)})</span></div>
      </td>`;

    const channelRows = channels.length
        ? channels.map((c) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${c.source} / ${c.medium}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(c.sessions)}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(c.users)}</td></tr>`).join('')
        : `<tr><td colspan="3" style="padding:10px;color:#9ca3af">이메일/카톡 유입 데이터 없음 (UTM 클릭 누적 대기 중)</td></tr>`;

    const eventRows = events.length
        ? events.map((e) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${EVENT_LABEL[e.name] || e.name}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(e.count)}</td></tr>`).join('')
        : `<tr><td colspan="2" style="padding:10px;color:#9ca3af">이벤트 데이터 없음 (앱 빌드 후 수집 대기)</td></tr>`;

    const platformRows = platforms.map((p) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">${p.platform}</td><td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(p.users)}</td></tr>`).join('');

    const maxDau = Math.max(1, ...dau.map((d) => d.users));
    const dauBars = dau.map((d) => {
        const h = Math.round((d.users / maxDau) * 60);
        const md = `${d.date.slice(4, 6)}/${d.date.slice(6, 8)}`;
        return `<td style="vertical-align:bottom;text-align:center;padding:0 3px">
            <div style="background:#3b82f6;width:22px;height:${h}px;border-radius:3px 3px 0 0;margin:0 auto"></div>
            <div style="font-size:10px;color:#6b7280;margin-top:3px">${md}</div>
            <div style="font-size:10px;color:#374151">${d.users}</div></td>`;
    }).join('');

    return `<!DOCTYPE html><html lang="ko"><body style="margin:0;background:#f9fafb;font-family:-apple-system,'Malgun Gothic',sans-serif">
    <div style="max-width:640px;margin:0 auto;padding:24px">
      <h1 style="font-size:20px;color:#111827;margin:0 0 4px">📊 씬짜오 주간 측정 리포트</h1>
      <p style="font-size:13px;color:#6b7280;margin:0 0 20px">최근 7일 (어제까지) · 앱+웹 통합 · 지난주 대비</p>

      <table cellpadding="0" cellspacing="8" style="width:100%;border-collapse:separate"><tr>
        ${card('총 사용자', totals.totalUsers)}
        ${card('신규 사용자', totals.newUsers)}
      </tr><tr>
        ${card('앱 설치(first_open)', installs)}
        ${card('세션', totals.sessions)}
      </tr></table>

      <h2 style="font-size:15px;color:#111827;margin:24px 0 8px">📈 일별 활성 사용자</h2>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;padding:12px"><tr>${dauBars || '<td style="color:#9ca3af;padding:10px">데이터 없음</td>'}</tr></table>

      <h2 style="font-size:15px;color:#111827;margin:24px 0 8px">📣 채널별 유입 (이메일·카톡)</h2>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:13px">
        <tr style="background:#f3f4f6"><th style="text-align:left;padding:8px 10px">소스/매체</th><th style="text-align:right;padding:8px 10px">세션</th><th style="text-align:right;padding:8px 10px">사용자</th></tr>
        ${channelRows}
      </table>

      <h2 style="font-size:15px;color:#111827;margin:24px 0 8px">🎯 콘텐츠 이벤트</h2>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:13px">
        <tr style="background:#f3f4f6"><th style="text-align:left;padding:8px 10px">이벤트</th><th style="text-align:right;padding:8px 10px">횟수</th></tr>
        ${eventRows}
      </table>

      <h2 style="font-size:15px;color:#111827;margin:24px 0 8px">📱 플랫폼 비중</h2>
      <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:13px">
        <tr style="background:#f3f4f6"><th style="text-align:left;padding:8px 10px">플랫폼</th><th style="text-align:right;padding:8px 10px">사용자</th></tr>
        ${platformRows || '<tr><td colspan="2" style="padding:10px;color:#9ca3af">데이터 없음</td></tr>'}
      </table>

      <p style="font-size:11px;color:#9ca3af;margin:24px 0 0">자동 생성 · GA4 ${kpis.propertyId} · 매주 월요일 09:00 (베트남) 발송</p>
    </div></body></html>`;
}
