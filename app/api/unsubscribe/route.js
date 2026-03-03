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

        const subscriber = await prisma.subscriber.findUnique({
            where: { email },
        });

        if (!subscriber) {
            return NextResponse.json(
                { message: "등록되지 않은 이메일입니다." },
                { status: 404 }
            );
        }

        if (!subscriber.isActive) {
            return NextResponse.json(
                { message: "이미 구독이 취소된 상태입니다." },
                { status: 400 }
            );
        }

        await prisma.subscriber.update({
            where: { email },
            data: { isActive: false },
        });

        return NextResponse.json({ message: "구독이 성공적으로 취소되었습니다." });
    } catch (error) {
        console.error("Unsubscribe Error:", error);
        return NextResponse.json(
            { message: "서버 오류가 발생했습니다. 다시 시도해주세요." },
            { status: 500 }
        );
    }
}
