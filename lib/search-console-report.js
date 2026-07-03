// 🔍 [측정 인프라] Google Search Console(검색 노출) 주간 리포트 조각.
// GA4(사이트 안 행동)와 별개로, "구글 검색에서 우리가 얼마나 노출/클릭되나"를 측정한다.
// = SEO가 실제로 먹히는지 보는 유일한 직접 지표(노출수·클릭수·CTR·평균순위·검색어).
//
// 인증: GA4와 동일한 Firebase Admin 서비스계정 재사용 (스코프만 webmasters.readonly).
// 필요한 1회 콘솔 작업:
//   1) 서치콘솔 → 설정 → 사용자 및 권한 → 사용자 추가 →
//      firebase-adminsdk-fbsvc@chaovietnam-login.iam.gserviceaccount.com  (권한: 제한/전체 아무거나)
//   2) GCP(chaovietnam-login)에서 "Google Search Console API" 사용 설정(Enable).
//   (선택) .env SEARCH_CONSOLE_SITE 로 속성 강제 지정. 미지정 시 접근가능 속성에서 chaovietnam 자동 선택.

import { GoogleAuth } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const API = 'https://www.googleapis.com/webmasters/v3';
const LAG_DAYS = 3; // GSC 데이터는 보통 2~3일 지연되므로 오늘-3일까지만 집계

let _authClient = null;
async function getToken() {
  if (!_authClient) {
    const opts = { scopes: SCOPES };
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      opts.credentials = { client_email: sa.client_email, private_key: sa.private_key };
      opts.projectId = sa.project_id;
    }
    _authClient = await new GoogleAuth(opts).getClient();
  }
  const { token } = await _authClient.getAccessToken();
  if (!token) throw new Error('Search Console 토큰 발급 실패 (서비스계정/권한 확인)');
  return token;
}

function ymd(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; }

// 서비스계정이 접근 가능한 속성 중 chaovietnam 선택 (도메인 속성 우선)
async function resolveSite(token) {
  if (process.env.SEARCH_CONSOLE_SITE) return process.env.SEARCH_CONSOLE_SITE;
  const res = await fetch(`${API}/sites`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`sites.list ${res.status} — 서비스계정이 서치콘솔에 추가됐는지 확인`);
  const { siteEntry = [] } = await res.json();
  const sites = siteEntry.map((s) => s.siteUrl);
  const domain = sites.find((s) => s.startsWith('sc-domain:') && s.includes('chaovietnam'));
  const urlp = sites.find((s) => s.includes('chaovietnam.co.kr'));
  const picked = domain || urlp;
  if (!picked) throw new Error(`chaovietnam 속성 접근 불가 (접근가능: ${sites.join(', ') || '없음'})`);
  return picked;
}

async function query(token, site, body) {
  const res = await fetch(`${API}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`searchAnalytics ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

async function totals(token, site, start, end) {
  const j = await query(token, site, { startDate: ymd(start), endDate: ymd(end) });
  const r = (j.rows && j.rows[0]) || {};
  return { clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0 };
}

// 최근 7일 vs 그 이전 7일 + 상위 검색어/페이지
export async function fetchSearchConsoleKpis() {
  try {
    const token = await getToken();
    const site = await resolveSite(token);
    const curEnd = daysAgo(LAG_DAYS), curStart = daysAgo(LAG_DAYS + 6);
    const prevEnd = daysAgo(LAG_DAYS + 7), prevStart = daysAgo(LAG_DAYS + 13);
    const [cur, prev, qz, pz] = await Promise.all([
      totals(token, site, curStart, curEnd),
      totals(token, site, prevStart, prevEnd),
      query(token, site, { startDate: ymd(curStart), endDate: ymd(curEnd), dimensions: ['query'], rowLimit: 10 }),
      query(token, site, { startDate: ymd(curStart), endDate: ymd(curEnd), dimensions: ['page'], rowLimit: 10 }),
    ]);
    return {
      ok: true, site, period: `${ymd(curStart)} ~ ${ymd(curEnd)}`,
      cur, prev,
      topQueries: (qz.rows || []).map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position })),
      topPages: (pz.rows || []).map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── HTML 조각 (주간 리포트 이메일에 덧붙임) ──────────────────────────
const int = (n) => Math.round(n).toLocaleString('ko-KR');
const pct = (n) => (n * 100).toFixed(1) + '%';
const pos = (n) => (n ? n.toFixed(1) + '위' : '-');
function wow(cur, prev, invert = false) {
  if (!prev) return '<span style="color:#888">신규</span>';
  const ch = (cur - prev) / prev * 100;
  const up = ch >= 0;
  // 순위(position)는 낮을수록 좋음 → invert
  const good = invert ? !up : up;
  const arrow = up ? '▲' : '▼';
  const color = good ? '#16a34a' : '#dc2626';
  return `<span style="color:${color}">${arrow} ${Math.abs(ch).toFixed(0)}%</span>`;
}

export function buildSearchConsoleHtml(sc) {
  if (!sc || !sc.ok) {
    const msg = sc?.error || '알 수 없는 오류';
    return `<div style="margin:24px 16px;padding:16px;border:1px dashed #f59e0b;border-radius:8px;background:#fffbeb;font-family:sans-serif;color:#92400e">
      <strong>🔍 검색 노출(서치콘솔) — 연결 대기</strong><br/>
      <span style="font-size:13px">아직 데이터를 못 가져왔어요: ${msg}<br/>
      서치콘솔 → 설정 → 사용자 및 권한에 서비스계정(<code>firebase-adminsdk-fbsvc@chaovietnam-login.iam.gserviceaccount.com</code>)을 추가하면 다음 리포트부터 표시됩니다.</span>
    </div>`;
  }
  const c = sc.cur, p = sc.prev;
  const qRows = sc.topQueries.map((r, i) => `<tr>
    <td style="padding:4px 8px;color:#888">${i + 1}</td>
    <td style="padding:4px 8px">${r.key}</td>
    <td style="padding:4px 8px;text-align:right">${int(r.clicks)}</td>
    <td style="padding:4px 8px;text-align:right;color:#888">${int(r.impressions)}</td>
    <td style="padding:4px 8px;text-align:right;color:#888">${pos(r.position)}</td>
  </tr>`).join('');
  return `<div style="margin:24px 16px;font-family:sans-serif">
    <h2 style="font-size:18px;border-bottom:2px solid #ea580c;padding-bottom:6px">🔍 구글 검색 노출 (SEO) <span style="font-size:12px;color:#888;font-weight:normal">${sc.period}</span></h2>
    <table style="width:100%;border-collapse:collapse;margin:12px 0">
      <tr>
        <td style="padding:10px;background:#f9fafb;border-radius:6px;text-align:center">
          <div style="font-size:12px;color:#888">클릭</div>
          <div style="font-size:22px;font-weight:bold">${int(c.clicks)}</div>
          <div style="font-size:12px">${wow(c.clicks, p.clicks)}</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:10px;background:#f9fafb;border-radius:6px;text-align:center">
          <div style="font-size:12px;color:#888">노출</div>
          <div style="font-size:22px;font-weight:bold">${int(c.impressions)}</div>
          <div style="font-size:12px">${wow(c.impressions, p.impressions)}</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:10px;background:#f9fafb;border-radius:6px;text-align:center">
          <div style="font-size:12px;color:#888">CTR</div>
          <div style="font-size:22px;font-weight:bold">${pct(c.ctr)}</div>
          <div style="font-size:12px">${wow(c.ctr, p.ctr)}</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:10px;background:#f9fafb;border-radius:6px;text-align:center">
          <div style="font-size:12px;color:#888">평균순위</div>
          <div style="font-size:22px;font-weight:bold">${pos(c.position)}</div>
          <div style="font-size:12px">${wow(c.position, p.position, true)}</div>
        </td>
      </tr>
    </table>
    <div style="font-size:13px;color:#555;margin:4px 0 8px">가장 많이 클릭된 검색어 (사람들이 이 말로 우리를 찾음)</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="color:#888;border-bottom:1px solid #eee">
        <td style="padding:4px 8px">#</td><td style="padding:4px 8px">검색어</td>
        <td style="padding:4px 8px;text-align:right">클릭</td>
        <td style="padding:4px 8px;text-align:right">노출</td>
        <td style="padding:4px 8px;text-align:right">순위</td>
      </tr>
      ${qRows || '<tr><td colspan="5" style="padding:8px;color:#888">데이터 없음</td></tr>'}
    </table>
  </div>`;
}
