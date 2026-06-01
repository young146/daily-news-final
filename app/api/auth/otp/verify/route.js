import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyChallenge, OTP_COOKIE } from '@/lib/otp';
import { generateToken, TOKEN_NAME, createInitialAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 인증코드 검증 → 성공 시 관리자 세션 쿠키 발급 (비밀번호 없이 로그인).
export async function POST(request) {
    try {
        const { code } = await request.json();
        const challenge = request.cookies.get(OTP_COOKIE)?.value;

        if (!challenge || !code) {
            return NextResponse.json({ error: '코드가 없거나 만료되었습니다. 다시 요청하세요.' }, { status: 400 });
        }

        const email = verifyChallenge(challenge, String(code).trim());
        if (!email) {
            return NextResponse.json({ error: '인증코드가 올바르지 않거나 만료되었습니다.' }, { status: 401 });
        }

        await createInitialAdmin();
        const user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (!user) {
            return NextResponse.json({ error: '관리자 계정을 찾을 수 없습니다.' }, { status: 500 });
        }

        const token = generateToken(user);
        const res = NextResponse.json({ success: true, user: { email: user.email, role: user.role } });
        res.cookies.set(TOKEN_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7,
            path: '/',
        });
        res.cookies.set(OTP_COOKIE, '', { maxAge: 0, path: '/' }); // 사용한 챌린지 폐기
        return res;
    } catch (error) {
        console.error('[OTP verify] 실패:', error);
        return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
    }
}
