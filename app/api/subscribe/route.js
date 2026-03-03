import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { message: "유효한 이메일 주소를 입력해주세요." },
        { status: 400 }
      );
    }

    // Check if subscriber exists
    const existingSubscriber = await prisma.subscriber.findUnique({
      where: { email },
    });

    if (existingSubscriber) {
      if (existingSubscriber.isActive) {
        return NextResponse.json(
          { message: "이미 구독 중인 이메일입니다." },
          { status: 400 }
        );
      } else {
        // Reactivate subscription
        await prisma.subscriber.update({
          where: { email },
          data: { isActive: true },
        });
        return NextResponse.json({ message: "구독이 다시 활성화되었습니다." });
      }
    }

    // Create new subscriber
    await prisma.subscriber.create({
      data: {
        email,
        isActive: true,
      },
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
