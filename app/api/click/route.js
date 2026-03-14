import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    const type = searchParams.get('type') || 'NEWS'; // 'NEWS', 'PROMO', 'TERMINAL'

    if (!targetUrl) {
      return NextResponse.redirect(process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr');
    }

    // 안전하게 IP 및 User-Agent 추출 (Vercel 환경 지원)
    const ipMatch = request.headers.get('x-forwarded-for') || '';
    const ip = ipMatch.split(',')[0] || 'unknown';
    const userAgent = (request.headers.get('user-agent') || '').substring(0, 200);

    // ClickLog 생성 (실패하더라도 redirect는 진행되도록 catch 블록에서 처리)
    await prisma.clickLog.create({
      data: {
        url: targetUrl,
        type: type,
        userIp: ip,
        userAgent: userAgent,
      }
    });

    // 최종 목적지로 리다이렉트 (302)
    return NextResponse.redirect(targetUrl);

  } catch (err) {
    console.error('[API/Click] Failed to log click:', err);
    
    // 로깅에 실패하더라도 수신자가 원래 뉴스 페이지로 이동할 수 있도록 Fallback 리다이렉트
    const { searchParams } = new URL(request.url);
    const fallbackUrl = searchParams.get('url');
    
    if (fallbackUrl) {
       return NextResponse.redirect(fallbackUrl);
    }
    
    return NextResponse.redirect(process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr');
  }
}
