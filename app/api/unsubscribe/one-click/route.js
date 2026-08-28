import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 원클릭 수신 거부 (RFC 8058)
 * =====================================================================
 * 왜 필요한가 (2026-08-28):
 *   메일 프로그램(지메일·아웃룩 등)이 메일 위쪽에 보여 주는 **「수신거부」 버튼**이
 *   눌렸을 때 실제로 처리되는 자리다. 지금까지 우리 메일에는 그 버튼을 만드는
 *   헤더가 **주 발송 경로에 아예 없었다.**
 *
 *   버튼이 없으면 그만 받고 싶은 사람은 **「스팸 신고」를 누른다.** 그게 유일하게
 *   눈에 보이는 버튼이기 때문이다. 스팸 신고는 발송 도메인 평판을 깎고,
 *   그 대가는 신고한 사람이 아니라 **남아 있는 나머지 전원**이 치른다
 *   (메일이 스팸함으로 밀린다).
 *
 * ⚠️ GET 으로는 절대 해지하지 않는다.
 *   회사 메일 보안 스캐너는 **메일 안의 링크를 사람 대신 미리 눌러 본다.**
 *   (우리 발송 코드에도 그 때문에 클릭 추적을 껐다는 기록이 있다.)
 *   GET 으로 해지되게 만들면 **본인이 누르지도 않았는데 해지되는 사고**가 난다.
 *   그래서 GET 은 확인 페이지로 보내기만 하고, 실제 해지는 POST 에서만 한다.
 */

/** 메일 프로그램이 「수신거부」 버튼을 눌렀을 때 — 여기서만 실제로 해지한다 */
export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get('e') || '').trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return new NextResponse('Bad Request', { status: 400 });
    }

    // 이미 꺼져 있어도 성공으로 답한다 — 메일 프로그램에 실패를 돌려주면
    // 사용자에게 "수신거부 실패" 라고 뜨고, 그 사람은 결국 스팸 신고를 누른다.
    await prisma.subscriber.updateMany({
      where: { email, isActive: true },
      data: { isActive: false },
    });

    return new NextResponse('OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error('[unsubscribe/one-click]', error);
    // 여기서도 실패를 알리지 않는다 (위와 같은 이유). 로그로만 남긴다.
    return new NextResponse('OK', { status: 200 });
  }
}

/** 사람이 링크를 직접 열었을 때 — 해지하지 않고 확인 페이지로 보낸다 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get('e') || '').trim();
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr';
  const baseUrl = /^https?:\/\//.test(base) ? base : `https://${base}`;
  const to = `${baseUrl}/unsubscribe${email ? `?email=${encodeURIComponent(email)}` : ''}`;
  return NextResponse.redirect(to, 302);
}
