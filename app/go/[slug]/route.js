import { NextResponse } from 'next/server';
import { getAffiliate } from '@/lib/affiliate-links';

export const dynamic = 'force-dynamic';

// ── GET /go/<slug>?src=<위치> — 제휴 링크 추적 리다이렉트 ──────────────
//  예) /go/aliexpress?src=daily_email  →  invl.me 딥링크로 302
//  - 우리 링크(/go/…)를 한 겹 감싸므로, 제휴사/딥링크가 바뀌어도 콘텐츠 링크는 불변.
//  - src(어디서 눌렀나: web/email/app 등)는 성과분석용. (전환은 Involve가 자체 추적)
//  - 등록 안 됐거나 딥링크 미완인 slug 는 홈으로 안전 폴백.
export async function GET(request, { params }) {
  const { slug } = await params; // Next 15+ 에서 params 는 Promise
  const entry = getAffiliate(slug);
  if (!entry) {
    return NextResponse.redirect('https://chaovietnam.co.kr', { status: 302 });
  }

  // TODO(v2 · 측정): affiliate_clicks 로깅 { slug, src, ts, ipCountry } →
  //   Firestore 또는 Neon. 지금은 리다이렉트만(측정은 Involve 대시보드 + v2에서 보강).
  //   const src = new URL(request.url).searchParams.get('src') || 'direct';

  return NextResponse.redirect(entry.deeplink, { status: 302 });
}
