// ─────────────────────────────────────────────────────────────────────────────
// 📅 광고 만료 알림 — 영업이 놓치지 않게 시스템이 대신 챙긴다
//
// 왜 만들었나 (2026-08-09):
//   재고를 전수 조회해보니 **8개 광고주의 계약이 이미 만료된 채 '활성' 상태로 방치**돼
//   있었다(김안과병원·한세실업·SOMEC 7/27, EmoiTech·KIZUNA·진원비나·대열보일러 7/31,
//   신한은행베트남 8/03). 시스템이 날짜로 걸러 노출은 안 됐지만, **갱신 연락이 아무에게도
//   안 나갔다.** 영업 담당이 한 명뿐이라 사람 기억에 의존하면 반드시 샌다.
//
// 언제 보내나 (3단계):
//   D-15  "곧 끝납니다"        → 갱신 협상을 시작할 시간
//   D-7   "아직 갱신 안 됐습니다"  → 마지막 알림 (D-15 이후 종료일이 안 바뀐 경우만)
//   D+7   "만료됐습니다"        → 복구 영업 대상으로 넘김
//
//   ⚠️ 정확히 그날만 보내지 않는다. 크론이 하루 걸러도 놓치지 않도록 **구간 + 보낸 표시**
//      방식을 쓴다. (endDate 를 미루면 표시가 초기화되어 다음 주기에 다시 알린다)
//
// 메일에 성과 숫자를 함께 싣는다:
//   "갱신해주세요" 만으로는 약하다. 지난 30일 노출·클릭을 함께 보내면 영업이 그 자리에서
//   근거로 쓸 수 있다. 성과 조회가 실패해도 알림 자체는 반드시 나가게 분리했다.
// ─────────────────────────────────────────────────────────────────────────────

import { getFirestore } from '@/lib/firebase-admin';

const COL = 'ads_unified';

// 알림 단계 정의. 순서가 곧 우선순위(먼저 맞는 것 하나만 보낸다).
export const STAGES = [
    { key: 'd15', label: 'D-15 · 갱신 협상 시작', test: (d) => d <= 15 && d > 7 },
    { key: 'd7', label: 'D-7 · 아직 갱신 안 됨', test: (d) => d <= 7 && d >= 0 },
    { key: 'expired7', label: 'D+7 · 만료됨', test: (d) => d <= -7 },
];

// 'YYYY-MM-DD' 두 개의 날짜 차이(일). 시간대 문제를 피하려고 UTC 정오로 고정해 계산한다.
export function daysBetween(fromYmd, toYmd) {
    const a = Date.parse(`${fromYmd}T12:00:00Z`);
    const b = Date.parse(`${toYmd}T12:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
}

/**
 * 광고 하나가 지금 어느 알림 단계인지 판정한다. 보낼 게 없으면 null.
 * @param {object} ad    ads_unified 문서 (+ id)
 * @param {string} today 'YYYY-MM-DD'
 */
export function classifyAd(ad, today) {
    if (!ad?.endDate) return null;              // 종료일 없는 상시 광고는 대상 아님
    const daysLeft = daysBetween(today, ad.endDate);
    if (daysLeft === null) return null;

    const stage = STAGES.find((s) => s.test(daysLeft));
    if (!stage) return null;

    // 이미 이 종료일로 그 단계를 보냈으면 건너뛴다.
    // endDate 를 함께 저장하므로, 갱신해서 종료일이 밀리면 자동으로 다시 알린다.
    const sent = ad.alertSent || {};
    if (sent[stage.key] === ad.endDate) return null;

    return { stage: stage.key, label: stage.label, daysLeft };
}

/** ads_unified 전체를 읽어 알림 대상만 추린다. */
export async function collectExpiringAds(today) {
    const db = getFirestore();
    const snap = await db.collection(COL).get();
    const out = [];
    snap.forEach((doc) => {
        const ad = { id: doc.id, ...doc.data() };
        const hit = classifyAd(ad, today);
        if (hit) out.push({ ...ad, ...hit });
    });
    // 급한 것(남은 일수 적은 것)부터
    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
}

/** 보냈다고 표시. 실패해도 알림 자체는 이미 나갔으므로 throw 하지 않는다. */
export async function markAlerted(items) {
    const db = getFirestore();
    const results = { ok: 0, fail: 0 };
    for (const it of items) {
        try {
            await db.collection(COL).doc(it.id).set(
                { alertSent: { [it.stage]: it.endDate } },
                { merge: true },
            );
            results.ok += 1;
        } catch (e) {
            console.warn('[ad-alerts] 표시 실패:', it.id, e?.message);
            results.fail += 1;
        }
    }
    return results;
}

// ── 메일 본문 ────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STAGE_STYLE = {
    d15: { bg: '#FFF7ED', border: '#FDBA74', title: '🟡 15일 뒤 만료 — 갱신 협상을 시작할 때' },
    d7: { bg: '#FEF2F2', border: '#FCA5A5', title: '🔴 7일 안에 만료 — 아직 갱신 안 됨' },
    expired7: { bg: '#F3F4F6', border: '#D1D5DB', title: '⚫ 이미 만료됨 — 복구 영업 대상' },
};

/**
 * @param {array}  items  collectExpiringAds 결과
 * @param {string} today  'YYYY-MM-DD'
 * @param {object} stats  { [광고제목]: { impressions, clicks } } — 없으면 성과열 생략
 */
export function buildExpiryEmailHtml(items, today, stats = {}) {
    const byStage = { d15: [], d7: [], expired7: [] };
    for (const it of items) (byStage[it.stage] || []).push(it);

    const hasStats = Object.keys(stats).length > 0;

    const section = (key) => {
        const list = byStage[key];
        if (!list.length) return '';
        const st = STAGE_STYLE[key];
        const rows = list.map((it) => {
            const s = stats[it.title] || {};
            const perf = hasStats
                ? `<td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap">${(s.impressions || 0).toLocaleString()}</td>
                   <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right;white-space:nowrap">${(s.clicks || 0).toLocaleString()}</td>`
                : '';
            const dayText = it.daysLeft >= 0 ? `${it.daysLeft}일 남음` : `${-it.daysLeft}일 지남`;
            return `<tr>
                <td style="padding:8px 10px;border-top:1px solid #e5e7eb"><b>${esc(it.title || '(제목 없음)')}</b></td>
                <td style="padding:8px 10px;border-top:1px solid #e5e7eb;white-space:nowrap">${esc(it.endDate)}</td>
                <td style="padding:8px 10px;border-top:1px solid #e5e7eb;white-space:nowrap">${dayText}</td>
                <td style="padding:8px 10px;border-top:1px solid #e5e7eb">${esc((it.surfaces || []).join(', ') || '-')}</td>
                ${perf}
            </tr>`;
        }).join('');

        return `
        <div style="background:${st.bg};border:1px solid ${st.border};border-radius:10px;padding:14px;margin:0 0 16px">
          <div style="font-weight:700;font-size:15px;margin-bottom:10px">${st.title} <span style="color:#6b7280;font-weight:400">(${list.length}건)</span></div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border-radius:8px;overflow:hidden">
            <tr style="background:#f9fafb">
              <th style="padding:8px 10px;text-align:left">광고주</th>
              <th style="padding:8px 10px;text-align:left">종료일</th>
              <th style="padding:8px 10px;text-align:left">상태</th>
              <th style="padding:8px 10px;text-align:left">게재 지면</th>
              ${hasStats ? '<th style="padding:8px 10px;text-align:right">30일 노출</th><th style="padding:8px 10px;text-align:right">30일 클릭</th>' : ''}
            </tr>
            ${rows}
          </table>
        </div>`;
    };

    const body = STAGES.map((s) => section(s.key)).join('');

    return `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic','맑은 고딕',sans-serif;color:#111827">
  <div style="max-width:760px;margin:0 auto;background:#fff;border-radius:12px;padding:22px">
    <h1 style="margin:0 0 4px;font-size:19px">📅 광고 만료 알림</h1>
    <div style="color:#6b7280;font-size:13px;margin-bottom:18px">${esc(today)} 기준 · 대상 ${items.length}건</div>
    ${body || '<div style="color:#6b7280;padding:20px 0">오늘 알릴 만료 건이 없습니다.</div>'}
    <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.7">
      · 같은 광고는 단계별로 <b>한 번만</b> 알립니다. 종료일을 미루면 다음 주기에 다시 알립니다.<br>
      · 갱신·종료 처리는 <b>통합 광고센터</b>에서 종료일을 수정하거나 활성을 끄면 됩니다.<br>
      ${hasStats ? '· 노출·클릭은 최근 30일 GA4 집계입니다(웹+앱 합산).' : '· 성과 숫자는 이번 회차에 조회하지 못했습니다.'}
    </div>
  </div>
</body></html>`;
}
