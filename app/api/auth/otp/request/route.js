import { NextResponse } from 'next/server';
import { genCode, signChallenge, OTP_COOKIE, OTP_ALLOWED } from '@/lib/otp';
import { sendNewsletterWithFallback } from '@/lib/email-service';

export const dynamic = 'force-dynamic';

// 관리자 이메일로 6자리 인증코드 발송. 화이트리스트 외 주소는 조용히 무시(존재 노출 방지).
export async function POST(request) {
    try {
        const { email } = await request.json();
        const e = (email || '').trim().toLowerCase();

        if (!OTP_ALLOWED.includes(e)) {
            // 허용되지 않은 주소 — 성공처럼 응답하되 메일은 보내지 않음
            return NextResponse.json({ success: true });
        }

        const code = genCode();
        const challenge = signChallenge(e, code);
        const html = `<div style="font-family:-apple-system,'Malgun Gothic',sans-serif;max-width:420px;margin:0 auto;padding:24px">
            <h2 style="color:#111827">🔐 씬짜오 관리자 인증코드</h2>
            <p style="color:#374151;font-size:14px">아래 6자리 코드를 로그인 화면에 입력하세요. (10분간 유효)</p>
            <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#1e3a5f;background:#f3f4f6;border-radius:10px;padding:18px;text-align:center;margin:16px 0">${code}</div>
            <p style="color:#9ca3af;font-size:12px">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
        </div>`;

        await sendNewsletterWithFallback([e], '🔐 씬짜오 관리자 인증코드', html, {
            forceSmtp: true,
            campaignId: 'admin_otp',
        });

        const res = NextResponse.json({ success: true });
        res.cookies.set(OTP_COOKIE, challenge, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600,
            path: '/',
        });
        return res;
    } catch (error) {
        console.error('[OTP request] 실패:', error);
        return NextResponse.json({ success: false, error: '코드 발송 실패' }, { status: 500 });
    }
}
