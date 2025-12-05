import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }
  
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('xinchao_auth_token');
    
    if (!token) {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*']
};
