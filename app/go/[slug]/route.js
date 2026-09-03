import { NextResponse } from 'next/server';
import { getAffiliate } from '@/lib/affiliate-links';
import prisma from '../../../lib/prisma.js';

export const dynamic = 'force-dynamic';

// ── GET /go/<slug>?src=<위치> — 제휴 링크 추적 리다이렉트 ──────────────
//  예) /go/aliexpress?src=daily_email  →  invl.me 딥링크로 302
//  - 우리 링크(/go/…)를 한 겹 감싸므로, 제휴사/딥링크가 바뀌어도 콘텐츠 링크는 불변.
//  - src(어디서 눌렀나: terminal/email/blog 등)는 성과분석용. (전환은 Involve가 자체 추적)
//  - 등록 안 됐거나 딥링크 미완인 slug 는 홈으로 안전 폴백.
//
// ── 클릭 기록 (2026-09-03 추가) ────────────────────────────────────────
// 왜 이제 넣나: 사장님 — *"뉴스 터미널에 제휴가 제일 잘 붙어 있어. 다만 실행해야만
//   돈이 되는 일이라 거의 흔적이 없지."* 그런데 확인해 보니 **정말로 흔적이 없었다.**
//   여기 `TODO(v2 · 측정)` 만 있고 리다이렉트만 하고 있어서, 눌렸는지 안 눌렸는지
//   알 방법이 아예 없었다(Vercel 웹 분석도 꺼져 있다).
//   ⇒ **재기 전에는 고칠 수 없다.** 먼저 숫자를 남긴다.
//
// 어디에 남기나: 이미 있는 `ClickLog` 테이블을 그대로 쓴다(app/api/click 과 같은 방식).
//   새 테이블을 만들면 관리자 통계·리포트가 두 곳을 봐야 한다.
//   type='AFFILIATE' 로 구분하고, url 에 `<slug>?src=<위치>` 를 넣어 어느 자리에서
//   눌렸는지까지 남긴다.
//
// ⚠️ **기록이 실패해도 리다이렉트는 반드시 된다.** 손님을 놓치느니 통계를 놓친다.
export async function GET(request, { params }) {
  const { slug } = await params; // Next 15+ 에서 params 는 Promise
  const entry = getAffiliate(slug);
  if (!entry) {
    return NextResponse.redirect('https://chaovietnam.co.kr', { status: 302 });
  }

  try {
    const src = new URL(request.url).searchParams.get('src') || 'direct';
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown';
    const userAgent = (request.headers.get('user-agent') || '').substring(0, 200);

    // 봇은 빼고 센다 — 크롤러가 링크를 따라가면 클릭 수가 부풀어 판단을 그르친다.
    const isBot = /bot|crawler|spider|crawling|preview|facebookexternalhit|slurp/i.test(userAgent);
    if (!isBot) {
      await prisma.clickLog.create({
        data: {
          url: `${slug}?src=${src}`,   // 어느 제휴를, 어느 자리에서
          type: 'AFFILIATE',
          userIp: ip,
          userAgent,
        },
      });
    }
  } catch (err) {
    // 기록 실패는 조용히 넘긴다 — 리다이렉트를 막으면 안 된다.
    console.error('[go] click log failed:', err?.message || err);
  }

  return NextResponse.redirect(entry.deeplink, { status: 302 });
}
