import { NextResponse, after } from "next/server";
import { PrismaClient } from "@prisma/client";
import { sendNewsletterWithFallback } from "@/lib/email-service";

const prisma = new PrismaClient();

/** 사람이 넣은 값을 다듬는다. 너무 긴 값은 잘라 낸다(장난 입력 방지). */
function clean(v, max = 80) {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
}

/**
 * 새 신청이 들어오면 관리자에게 알린다.
 *
 * 왜 알리나 (2026-08-28, 사장님 지시):
 *   우리 구독자의 값어치는 **나중에 우리 광고주가 될 수 있는 사람**에 있다.
 *   그래서 이름·연락처·회사를 함께 받고, 들어오는 즉시 알린다.
 *   명부에 쌓아 두고 나중에 훑는 것과, 그날 바로 아는 것은 다르다 —
 *   회사 이름이 붙은 신청은 **영업 기회**이고, 기회는 식는다.
 *
 * ⚠️ 알림이 실패해도 구독 신청 자체는 성공시킨다. 신청한 사람 잘못이 아니다.
 * ⚠️ 그리고 **기다리게 해서도 안 된다.** 메일 발송(SMTP)은 실측 10.8초가 걸렸다.
 *   그걸 붙잡고 있으면 신청한 사람이 「신청 중…」을 10초 보다가 떠난다.
 *   그래서 응답을 먼저 돌려주고 알림은 `after()` 로 뒤에서 보낸다.
 */
async function notifyAdmin(sub) {
  const { email, name, company, phone, phoneCountry, job, jobTitle, region, gender } = sub;
  const to = (
    process.env.SUBSCRIBE_ALERT_EMAIL ||
    process.env.AD_ALERT_EMAIL ||
    process.env.REPORT_EMAIL ||
    "younghan146@gmail.com,info@chaovietnam.co.kr"
  )
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (!to.length) return;

  const row = (label, value) =>
    value
      ? `<tr><td style="padding:8px 14px;color:#8A8578;font-size:14px;white-space:nowrap">${label}</td>
         <td style="padding:8px 14px;color:#231A14;font-size:15px;font-weight:700">${value}</td></tr>`
      : "";

  // 회사 이름이 있으면 제목에서부터 보이게 한다 — 열어 보기 전에 판단할 수 있어야 한다
  const subject = company
    ? `📮 뉴스레터 신규 구독 · ${company}${name ? ` (${name})` : ""}`
    : `📮 뉴스레터 신규 구독 · ${email}`;

  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#FDF9F4;
    font-family:-apple-system,'Malgun Gothic','Noto Sans KR',sans-serif;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #F0E7DE;border-radius:14px;overflow:hidden">
      <div style="background:#F97316;color:#fff;padding:16px 20px;font-size:17px;font-weight:800">
        뉴스레터 신규 구독 신청
      </div>
      <table style="width:100%;border-collapse:collapse">
        ${row("이름", name)}
        ${row("이메일", email)}
        ${row("연락처", phone ? `${phoneCountry === "KR" ? "+82" : "+84"} ${phone}` : "")}
        ${row("회사", company)}
        ${row("직책", jobTitle)}
        ${row("직업·업종", job)}
        ${row("근무지", region)}
        ${row("성별", gender)}
      </table>
      ${
        company
          ? `<div style="margin:4px 16px 16px;padding:12px 14px;background:#FFF3E9;
               border-radius:10px;font-size:13.5px;color:#8A5A32;line-height:1.6">
               회사 이름이 적힌 신청입니다. <b>광고 문의로 이어질 수 있는 접점</b>입니다.
             </div>`
          : ""
      }
      <div style="padding:0 16px 18px">
        <a href="https://daily-news-final.vercel.app/admin/subscribers"
           style="display:inline-block;background:#F97316;color:#fff;text-decoration:none;
                  padding:11px 20px;border-radius:9px;font-size:14px;font-weight:800">구독자 명부 열기</a>
      </div>
    </div></body></html>`;

  await sendNewsletterWithFallback(to, subject, html, {
    campaignId: `subscribe_alert_${Date.now()}`,
    forceSmtp: true, // 관리자 알림은 도달이 우선 — 주간 리포트와 같은 경로를 쓴다
  });
}

/**
 * 구독 신청.
 *
 * ⚠️ 이메일은 **반드시 소문자로 눕혀 저장한다** (2026-08-28).
 *   메일 시스템은 주소의 대소문자를 구분하지 않는다. 그런데 예전에는 받은 그대로
 *   저장해서 `Hong@paran.com` 과 `hong@paran.com` 이 **서로 다른 사람으로** 들어갔다.
 *   그 결과 17명이 같은 메일을 두 통씩 받고 있었다(그날 명부 정리로 해소).
 *   같은 메일이 두 번 오면 스팸 신고로 이어지고, 스팸 신고는 발송 도메인 평판을 깎아
 *   **나머지 수천 명의 도달률까지** 끌어내린다. 입구에서 막는 것이 가장 싸다.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const raw = typeof body?.email === "string" ? body.email.trim() : "";
    const email = raw.toLowerCase();

    // 형식 검사 — "@ 만 있으면 통과" 는 너무 헐거워 오타가 그대로 명부에 남는다.
    // 오타 주소는 영영 반송되고, 반송이 쌓이면 발송 평판이 나빠진다.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json(
        { message: "유효한 이메일 주소를 입력해주세요." },
        { status: 400 }
      );
    }

    // 이름·연락처는 **필수**다 (2026-08-28 사장님 지시).
    //   이메일만 있는 명단은 뉴스레터밖에 못 보낸다. 이름과 전화가 있어야
    //   나중에 광고 영업으로 이어갈 수 있는 명단이 된다.
    const name = clean(body?.name, 40);
    const phone = clean(body?.phone, 40);
    if (!name) {
      return NextResponse.json({ message: "이름을 입력해주세요." }, { status: 400 });
    }
    if (!phone || phone.replace(/\D/g, "").length < 8) {
      return NextResponse.json({ message: "휴대전화 번호를 입력해주세요." }, { status: 400 });
    }

    // 나머지는 선택 — 적어 준 만큼만 받는다.
    // 전화 국가는 "VN"/"KR" 둘 중 하나만 받는다. 엉뚱한 값이 들어오면 베트남으로 본다
    // (우리 독자 대다수가 현지 거주자다).
    const phoneCountry = body?.phoneCountry === "KR" ? "KR" : "VN";
    const company = clean(body?.company, 80);
    const job = clean(body?.job, 40);
    const jobTitle = clean(body?.jobTitle, 40);
    const region = clean(body?.region, 40);
    const gender = body?.gender === "남" || body?.gender === "여" ? body.gender : null;

    const existing = await prisma.subscriber.findUnique({ where: { email } });

    if (existing) {
      // 이미 있는 사람이 이번에 회사·연락처를 적어 주었다면 **비어 있는 칸만** 채운다.
      // 이미 들어 있는 값을 덮어쓰지 않는다 — 옛 정보가 더 정확할 수 있다.
      const fill = {};
      const maybe = { name, phone, phoneCountry, company, job, jobTitle, region, gender };
      for (const [k, v] of Object.entries(maybe)) {
        if (v && !existing[k]) fill[k] = v;
      }

      if (existing.isActive) {
        if (Object.keys(fill).length) {
          await prisma.subscriber.update({ where: { email }, data: fill });
        }
        return NextResponse.json(
          { message: "이미 구독 중인 이메일입니다." },
          { status: 400 }
        );
      }
      // 예전에 수신거부했던 사람이 다시 신청 → 되살린다
      await prisma.subscriber.update({
        where: { email },
        data: { isActive: true, ...fill },
      });
      return NextResponse.json({ message: "구독이 다시 활성화되었습니다." });
    }

    await prisma.subscriber.create({
      data: {
        email, isActive: true,
        name, phone, phoneCountry, company, job, jobTitle, region, gender,
      },
    });

    // 응답을 먼저 돌려주고, 알림은 그 뒤에 보낸다(위 설명 참고).
    after(async () => {
      try {
        await notifyAdmin({ email, name, phone, phoneCountry, company, job, jobTitle, region, gender });
      } catch (e) {
        console.error("[subscribe] 관리자 알림 실패(신청은 정상):", e?.message);
      }
    });

    return NextResponse.json(
      { message: "구독 신청이 완료되었습니다." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Subscription Error:", error);
    return NextResponse.json(
      { message: "서버 오류가 발생했습니다. 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
