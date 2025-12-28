import { NextResponse } from 'next/server';

export async function proxy(request) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*']
};
