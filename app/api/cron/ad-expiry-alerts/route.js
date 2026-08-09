import { NextResponse } from 'next/server';
import { collectExpiringAds, markAlerted, buildExpiryEmailHtml } from '@/lib/ad-alerts';
import { fetchAdStatsMap } from '@/lib/ad-stats-report';
import { sendNewsletterWithFallback } from '@/lib/email-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 📅 광고 만료 알림 — 매일 1회.
//   D-15 / D-7 / D+7 세 시점에 관리자에게 명단을 메일로 보낸다.
//   영업 담당이 한 명뿐이라 사람 기억에 맡기면 반드시 샌다(2026-08 실제로 8건 방치됨).
//
// 미리보기: /api/cron/ad-expiry-alerts?test=1  → 메일 발송 없이 HTML 만 반환.
//          ?test=1 은 '보냄 표시'도 남기지 않으므로 몇 번을 눌러도 안전하다.
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('test') === '1';

    // 베트남(UTC+7) 기준 날짜. 서버는 UTC 라 그냥 쓰면 자정 근처에 하루가 어긋난다.
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

    try {
        const items = await collectExpiringAds(today);

        // 알릴 게 없으면 조용히 끝낸다. 빈 메일을 매일 보내면 사람이 곧 안 읽게 된다.
        if (!items.length && !preview) {
            return NextResponse.json({ ok: true, today, count: 0, sent: false, reason: '대상 없음' });
        }

        // 성과 숫자는 '있으면 좋은 것'. 실패해도 알림은 반드시 나가야 하므로 분리한다.
        let stats = {};
        try {
            stats = await fetchAdStatsMap({ startDate: '30daysAgo', endDate: 'yesterday' });
        } catch (e) {
            console.warn('[ad-expiry-alerts] 성과 조회 실패(무시):', e?.message);
        }

        const html = buildExpiryEmailHtml(items, today, stats);
        if (preview) {
            return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        const recipients = (process.env.AD_ALERT_EMAIL || process.env.REPORT_EMAIL
            || 'younghan146@gmail.com,info@chaovietnam.co.kr')
            .split(',').map((e) => e.trim()).filter(Boolean);

        const urgent = items.filter((i) => i.stage === 'd7').length;
        const subject = `📅 광고 만료 알림 ${items.length}건${urgent ? ` · 🔴7일내 ${urgent}건` : ''} (${today})`;

        const result = await sendNewsletterWithFallback(recipients, subject, html, {
            campaignId: `ad_expiry_${today.replace(/-/g, '')}`,
            forceSmtp: true, // 주간 리포트와 동일 경로(SendGrid 미배달 회피)
        });

        // 발송에 성공한 뒤에만 표시한다. 순서가 바뀌면 메일이 실패했는데 표시만 남아 영영 안 알린다.
        const marked = await markAlerted(items);

        return NextResponse.json({ ok: true, today, count: items.length, urgent, recipients, marked, result });
    } catch (e) {
        console.error('[ad-expiry-alerts] 실패:', e?.message || e);
        return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 500 });
    }
}
