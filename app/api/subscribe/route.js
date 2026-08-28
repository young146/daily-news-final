import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 구독 신청.
 *
 * ⚠️ 이메일은 **반드시 소문자로 눕혀 저장한다** (2026-08-28).
 *   메일 시스템은 주소의 대소문자를 구분하지 않는다. 그런데 예전에는 받은 그대로
 *   저장해서 `Hong@paran.com` 과 `hong@paran.com` 이 **서로 다른 사람으로** 들어갔다.
 *   그 결과 17명이 같은 메일을 두 통씩 받고 있었다(그날 명부 정리로 해소).
 *   같은 메일이 두 번 오면 스팸 신고로 이어지고, 스팸 신고는 발송 도메인 평판을 깎아
 *   **나머지 7천 명의 도달률까지** 끌어내린다. 입구에서 막는 것이 가장 싸다.
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

    const existing = await prisma.subscriber.findUnique({ where: { email } });

    if (existing) {
      if (existing.isActive) {
        return NextResponse.json(
          { message: "이미 구독 중인 이메일입니다." },
          { status: 400 }
        );
      }
      // 예전에 수신거부했던 사람이 다시 신청 → 되살린다
      await prisma.subscriber.update({
        where: { email },
        data: { isActive: true },
      });
      return NextResponse.json({ message: "구독이 다시 활성화되었습니다." });
    }

    await prisma.subscriber.create({
      data: { email, isActive: true },
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
