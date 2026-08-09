import { NextResponse } from 'next/server';
import { fetchAdStats, buildAdStatsHtml } from '@/lib/ad-stats-report';
import { sendNewsletterWithFallback } from '@/lib/email-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 📊 광고주별 주간 성과 — 매주 월요일.
//   기존 /api/cron/weekly-report(사이트 전체 KPI)와 **일부러 분리했다**:
//     · 받는 사람이 다르다 (전체 KPI = 경영 / 광고 성과 = 영업)
//     · 한쪽이 실패해도 다른 쪽은 나가야 한다
//     · 광고 리포트는 광고주별로 잘라 재활용하므로 표가 독립적인 편이 낫다
//
// 미리보기: /api/cron/ad-weekly-stats?test=1
// 기간 지정: ?start=2026-08-01&end=2026-08-31  (광고주에게 월간 리포트를 뽑을 때)
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('test') === '1';
    const startDate = searchParams.get('start') || '7daysAgo';
    const endDate = searchParams.get('end') || 'yesterday';

    try {
        const data = await fetchAdStats({ startDate, endDate });

        const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        const periodLabel = startDate === '7daysAgo' ? `최근 7일 (${today} 기준)` : `${startDate} ~ ${endDate}`;
        const html = buildAdStatsHtml(data, periodLabel);

        if (preview) {
            return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        const recipients = (process.env.AD_ALERT_EMAIL || process.env.REPORT_EMAIL
            || 'younghan146@gmail.com,info@chaovietnam.co.kr')
            .split(',').map((e) => e.trim()).filter(Boolean);

        const subject = `📊 광고주별 주간 성과 (${today}) · 노출 ${data.totals.impressions.toLocaleString()} · 클릭 ${data.totals.clicks.toLocaleString()}`;
        const result = await sendNewsletterWithFallback(recipients, subject, html, {
            campaignId: `ad_stats_${today.replace(/-/g, '')}`,
            forceSmtp: true,
        });

        return NextResponse.json({ ok: true, period: periodLabel, advertisers: data.rows.length, totals: data.totals, recipients, result });
    } catch (e) {
        console.error('[ad-weekly-stats] 실패:', e?.message || e);
        return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 500 });
    }
}
