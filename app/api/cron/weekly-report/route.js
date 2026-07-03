import { NextResponse } from 'next/server';
import { fetchWeeklyKpis, buildReportHtml } from '@/lib/ga4-report';
import { fetchSearchConsoleKpis, buildSearchConsoleHtml } from '@/lib/search-console-report';
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
        let html = buildReportHtml(kpis);

        // 🔍 검색 노출(서치콘솔) 섹션 덧붙이기. 실패해도(연결 전 등) 전체 리포트는 계속 나가게 감쌈.
        try {
            const sc = await fetchSearchConsoleKpis();
            const scHtml = buildSearchConsoleHtml(sc);
            html = html.includes('</body>') ? html.replace('</body>', scHtml + '</body>') : html + scHtml;
        } catch (e) {
            console.warn('[Cron] 서치콘솔 섹션 생성 실패(무시하고 진행):', e.message);
        }

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
            forceSmtp: true, // SendGrid 미배달 회피 — 데일리 뉴스레터와 동일 SMTP 경로 사용
        });

        return NextResponse.json({ success: true, recipients, sent: result?.succeeded ?? 0, property: kpis.propertyId });
    } catch (error) {
        console.error('[Cron] 주간 리포트 실패:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
