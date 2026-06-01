import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// 간단 보호장치(Next 16 proxy, 구 middleware): /admin 페이지는 유효한 관리자
// 인증 쿠키가 있어야 접근 가능. 쿠키는 /api/auth/login(비밀번호) 또는
// /api/auth/otp/verify(이메일 코드)에서 발급된다.
const TOKEN_NAME = 'xinchao_auth_token';
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-not-for-production');

export async function proxy(request) {
    const { pathname } = request.nextUrl;

    // 로그인 페이지는 게이트 제외
    if (pathname.startsWith('/admin/login')) {
        return NextResponse.next();
    }

    const token = request.cookies.get(TOKEN_NAME)?.value;
    let valid = false;
    if (token) {
        try {
            const { payload } = await jwtVerify(token, secret);
            valid = payload?.role === 'ADMIN';
        } catch {
            valid = false;
        }
    }

    if (!valid) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/login';
        url.searchParams.set('from', pathname);
        return NextResponse.redirect(url);
    }
    return NextResponse.next();
}

export const config = {
    // /admin 과 그 하위 전부 보호 (/admin/login 은 위에서 예외 처리)
    matcher: ['/admin', '/admin/:path*'],
};
