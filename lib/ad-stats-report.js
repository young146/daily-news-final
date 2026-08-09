// ─────────────────────────────────────────────────────────────────────────────
// 📊 광고주별 성과 집계 (GA4) — 주간 리포트 + 만료 알림에 함께 싣는 숫자
//
// 원천: 웹(gtag)과 앱(Firebase Analytics)이 **같은 이벤트명·같은 파라미터**로 보낸다.
//   promo_impression / promo_click
//   promo_id · promo_name(광고주) · promo_slot(자리)
//   → 지면이 달라도 한 번의 질의로 합산된다.
//
// ⚠️ 전제: GA4 관리 → 맞춤 정의에 promo_name/promo_id/promo_slot 이
//    **이벤트 범위 맞춤 측정기준**으로 등록돼 있어야 한다(2026-08-09 등록 완료).
//    등록 전 기간은 광고주별로 쪼개지지 않는다(소급 안 됨).
// ─────────────────────────────────────────────────────────────────────────────

import { resolvePropertyId, runReport } from '@/lib/ga4-report';

export const EV_IMPRESSION = 'promo_impression';
export const EV_CLICK = 'promo_click';

/**
 * 기간 내 광고주별 노출·클릭을 가져온다.
 * @param {{startDate:string,endDate:string}} range  GA4 날짜 표기('7daysAgo','2026-08-01' 등)
 * @returns {{rows:Array, totals:object, platforms:object}}
 */
export async function fetchAdStats({ startDate = '7daysAgo', endDate = 'yesterday' } = {}) {
    const propertyId = await resolvePropertyId();
    const resp = await runReport(propertyId, {
        dateRanges: [{ startDate, endDate }],
        dimensions: [
            { name: 'customEvent:promo_name' },
            { name: 'eventName' },
            { name: 'platform' },
        ],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
            filter: {
                fieldName: 'eventName',
                inListFilter: { values: [EV_IMPRESSION, EV_CLICK] },
            },
        },
        limit: 1000,
    });

    // 광고주 → { impressions, clicks, platforms: { web|Android|iOS: {imp,clk} } }
    const map = new Map();
    const platforms = {};
    for (const row of resp.rows || []) {
        const name = row.dimensionValues?.[0]?.value || '(이름 없음)';
        const ev = row.dimensionValues?.[1]?.value;
        const plat = row.dimensionValues?.[2]?.value || '?';
        const n = Number(row.metricValues?.[0]?.value || 0);

        // GA4 는 값이 없을 때 '(not set)' 을 준다 — 측정기준 등록 전 데이터거나
        // 파라미터를 안 실은 이벤트다. 광고주 이름으로 쓸 수 없으니 그대로 표시해 눈에 띄게 둔다.
        if (!map.has(name)) map.set(name, { name, impressions: 0, clicks: 0, platforms: {} });
        const e = map.get(name);
        const p = (e.platforms[plat] = e.platforms[plat] || { impressions: 0, clicks: 0 });
        platforms[plat] = platforms[plat] || { impressions: 0, clicks: 0 };

        if (ev === EV_IMPRESSION) { e.impressions += n; p.impressions += n; platforms[plat].impressions += n; }
        else if (ev === EV_CLICK) { e.clicks += n; p.clicks += n; platforms[plat].clicks += n; }
    }

    const rows = [...map.values()]
        .map((r) => ({ ...r, ctr: r.impressions ? (r.clicks / r.impressions) * 100 : 0 }))
        .sort((a, b) => b.impressions - a.impressions);

    const totals = rows.reduce(
        (t, r) => ({ impressions: t.impressions + r.impressions, clicks: t.clicks + r.clicks }),
        { impressions: 0, clicks: 0 },
    );
    totals.ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;

    return { rows, totals, platforms };
}

/** 만료 알림 메일에 끼워 넣기 위한 { 광고주이름: {impressions,clicks} } 형태 */
export async function fetchAdStatsMap(range) {
    const { rows } = await fetchAdStats(range);
    const out = {};
    for (const r of rows) out[r.name] = { impressions: r.impressions, clicks: r.clicks };
    return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (n) => Number(n || 0).toLocaleString();

export function buildAdStatsHtml({ rows, totals, platforms }, periodLabel) {
    const platLine = Object.entries(platforms)
        .map(([k, v]) => `${esc(k)} ${num(v.impressions)}회`)
        .join(' · ') || '-';

    const body = rows.length
        ? rows.map((r) => `<tr>
            <td style="padding:9px 10px;border-top:1px solid #e5e7eb"><b>${esc(r.name)}</b></td>
            <td style="padding:9px 10px;border-top:1px solid #e5e7eb;text-align:right">${num(r.impressions)}</td>
            <td style="padding:9px 10px;border-top:1px solid #e5e7eb;text-align:right">${num(r.clicks)}</td>
            <td style="padding:9px 10px;border-top:1px solid #e5e7eb;text-align:right">${r.ctr.toFixed(2)}%</td>
          </tr>`).join('')
        : `<tr><td colspan="4" style="padding:22px 10px;color:#6b7280;text-align:center">
             아직 집계된 광고 성과가 없습니다.<br>
             <span style="font-size:12px">앱은 OTA 배포 후, 웹은 플러그인 업로드 후부터 쌓입니다.</span>
           </td></tr>`;

    return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic','맑은 고딕',sans-serif;color:#111827">
  <div style="max-width:760px;margin:0 auto;background:#fff;border-radius:12px;padding:22px">
    <h1 style="margin:0 0 4px;font-size:19px">📊 광고주별 주간 성과</h1>
    <div style="color:#6b7280;font-size:13px;margin-bottom:16px">${esc(periodLabel)}</div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="flex:1;min-width:150px;background:#F0F9FF;border:1px solid #BAE6FD;border-radius:10px;padding:12px">
        <div style="color:#0369a1;font-size:12px">총 노출</div>
        <div style="font-size:22px;font-weight:700">${num(totals.impressions)}</div>
      </div>
      <div style="flex:1;min-width:150px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px">
        <div style="color:#15803d;font-size:12px">총 클릭</div>
        <div style="font-size:22px;font-weight:700">${num(totals.clicks)}</div>
      </div>
      <div style="flex:1;min-width:150px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:12px">
        <div style="color:#c2410c;font-size:12px">클릭률</div>
        <div style="font-size:22px;font-weight:700">${totals.ctr.toFixed(2)}%</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f9fafb">
        <th style="padding:9px 10px;text-align:left">광고주</th>
        <th style="padding:9px 10px;text-align:right">노출</th>
        <th style="padding:9px 10px;text-align:right">클릭</th>
        <th style="padding:9px 10px;text-align:right">클릭률</th>
      </tr>
      ${body}
    </table>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.7">
      · 지면별 노출: ${platLine}<br>
      · 노출 기준 — 웹은 화면에 절반 이상 들어왔을 때, 앱은 실제로 보이는 슬롯일 때 1회.<br>
      · 이 표를 그대로 광고주에게 보내지 마세요. <b>광고주별로 잘라서</b> 보내는 용도입니다.
    </div>
  </div>
</body></html>`;
}
