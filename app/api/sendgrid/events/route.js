import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import prisma from '../../../../lib/prisma.js';

export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════════
//  SendGrid Event Webhook — 수신거부·스팸신고를 **명부에 자동 반영**한다
// ────────────────────────────────────────────────────────────────
//  왜 만드나 (2026-09-04 사장님: *"수신 거부는 자동으로 빠지도록 만들지"*):
//
//  우리 해지 버튼(`/api/unsubscribe`)은 DB 를 제대로 끈다. 그런데 **SendGrid 자체
//  해지 링크로 나간 사람은 우리에게 소식이 오지 않는다.** 그 결과:
//    · SendGrid 억제목록 수신거부 222명
//    · 우리 명부에는 그 222명이 **여전히 활성**
//    · 매 발송마다 그들에게 시도 → SendGrid 가 막음 (대시보드 UNSUBSCRIBE DROPS 221)
//  메일이 실제로 가지는 않았지만, **본인 의사가 우리 쪽에 반영되지 않은 상태**였다.
//
//  이 엔드포인트가 그 구멍을 메운다. SendGrid 가 사건이 생길 때마다 여기로 보내고,
//  우리는 즉시 명부에서 뺀다. 사람이 스크립트를 돌릴 필요가 없다.
//
//  ── 무엇에 반응하나 ──────────────────────────────────────────
//    unsubscribe / group_unsubscribe / spamreport → **즉시 비활성**
//      (거부 의사가 분명하다. 스팸신고는 수신거부보다 더 강한 의사다)
//
//  ── 무엇에 반응하지 않나 (중요) ───────────────────────────────
//    bounce / dropped / blocked → **건드리지 않는다.**
//      이건 거부가 아니라 배달 실패다. 한국 포털은 대량 발송자를 걸러낼 때
//      거짓으로 "계정 없음"을 답하기도 한다 — 2026-08-28 에 그 말을 믿고 84명을
//      껐다가 전원 되살린 적이 있다. 반송 처리는 사람이 사유를 보고 판단한다.
//
//  ── 보안 ────────────────────────────────────────────────────
//    SendGrid 의 서명(ECDSA)을 검증한다. 공개키는 SENDGRID_WEBHOOK_KEY 에 둔다.
//    ⚠️ 키가 없으면 **아무것도 처리하지 않고 200 을 돌려준다.**
//       401 을 주면 SendGrid 가 재시도를 쌓다가 웹훅을 꺼 버린다.
//       "설정이 덜 됐다"와 "공격"을 같은 실패로 취급하지 않는다.
//
//  설정 방법 (SendGrid 콘솔, 1회):
//    Settings → Mail Settings → Event Webhook
//      HTTP Post URL : https://daily-news-final.vercel.app/api/sendgrid/events
//      선택할 이벤트 : Unsubscribed · Group Unsubscribe · Spam Reports
//      Signature Verification: ON → 공개키를 .env 의 SENDGRID_WEBHOOK_KEY 에
// ════════════════════════════════════════════════════════════════

const ACT_ON = new Set(['unsubscribe', 'group_unsubscribe', 'spamreport']);

/** SendGrid ECDSA 서명 검증 (공개키가 없으면 null = 판정 보류) */
function verify(rawBody, signature, timestamp) {
  const pub = process.env.SENDGRID_WEBHOOK_KEY;
  if (!pub || !signature || !timestamp) return null;
  try {
    const key = crypto.createPublicKey({
      key: `-----BEGIN PUBLIC KEY-----\n${pub.replace(/-----(BEGIN|END) PUBLIC KEY-----|\s/g, '')}\n-----END PUBLIC KEY-----`,
      format: 'pem',
    });
    return crypto.verify(
      'sha256',
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export async function POST(request) {
  const raw = await request.text();

  const ok = verify(
    raw,
    request.headers.get('x-twilio-email-event-webhook-signature'),
    request.headers.get('x-twilio-email-event-webhook-timestamp'),
  );
  if (ok === false) {
    console.warn('[sendgrid-webhook] 서명 불일치 — 무시');
    return NextResponse.json({ ok: true, ignored: 'bad signature' });
  }
  if (ok === null) {
    // 공개키 미설정. 재시도가 쌓이지 않도록 200 을 준다.
    console.warn('[sendgrid-webhook] SENDGRID_WEBHOOK_KEY 없음 — 검증 없이 건너뜀');
    return NextResponse.json({ ok: true, ignored: 'no key' });
  }

  let events = [];
  try {
    events = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'bad json' });
  }
  if (!Array.isArray(events)) events = [events];

  // 거부 의사가 담긴 것만 골라 이메일을 모은다 (한 번에 여러 건이 온다)
  const emails = new Set();
  for (const e of events) {
    if (ACT_ON.has(String(e?.event || '').toLowerCase()) && e?.email) {
      emails.add(String(e.email).trim().toLowerCase());
    }
  }
  if (!emails.size) return NextResponse.json({ ok: true, changed: 0 });

  try {
    const res = await prisma.subscriber.updateMany({
      where: { email: { in: [...emails] }, isActive: true },
      data: { isActive: false },
    });
    if (res.count) {
      console.log(`[sendgrid-webhook] 수신거부 반영 ${res.count}명`);
    }
    return NextResponse.json({ ok: true, changed: res.count });
  } catch (err) {
    // DB 가 잠깐 안 되면 SendGrid 가 재시도하도록 500 을 준다 (여기선 놓치면 안 된다)
    console.error('[sendgrid-webhook] DB 실패:', err?.message || err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// SendGrid 가 설정 화면에서 URL 을 확인할 때 GET 을 보낸다
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'sendgrid event webhook' });
}
