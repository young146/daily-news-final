import { NextResponse } from 'next/server';
import { fetchWeeklyKpis, buildReportHtml } from '@/lib/ga4-report';
import { sendNewsletterWithFallback } from '@/lib/email-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// 🔍 [측정 인프라 Phase 5] 매주 월요일 09:00(베트남) GA4 KPI 요약을 관리자에게 이메일 발송.
// Vercel Cron (vercel.json) 또는 수동 호출(?test=1 미리보기) 둘 다 지원.
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const preview = searchParams.get('test') === '1'; // HTML 만 반환, 발송 안 함

    try {
        const kpis = await fetchWeeklyKpis();
        const html = buildReportHtml(kpis);

        if (preview) {
            return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        // 수신자: REPORT_EMAIL(쉼표 구분) 로 덮어쓰기 가능, 기본은 운영자 2곳
        const recipients = (process.env.REPORT_EMAIL || 'younghan146@gmail.com,info@chaovietnam.co.kr')
            .split(',').map((e) => e.trim()).filter(Boolean);

        const today = new Date().toISOString().slice(0, 10);
        const subject = `📊 씬짜오 주간 측정 리포트 (${today})`;
        const result = await sendNewsletterWithFallback(recipients, subject, html, {
            campaignId: `weekly_report_${today.replace(/-/g, '')}`,
        });

        return NextResponse.json({ success: true, recipients, sent: result?.succeeded ?? 0, property: kpis.propertyId });
    } catch (error) {
        console.error('[Cron] 주간 리포트 실패:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
