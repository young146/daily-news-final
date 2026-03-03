import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET: Fetch all subscribers
export async function GET() {
    try {
        const subscribers = await prisma.subscriber.findMany({
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(subscribers);
    } catch (error) {
        console.error("Fetch Subscribers Error:", error);
        return NextResponse.json(
            { message: "서버 오류가 발생했습니다." },
            { status: 500 }
        );
    }
}

// POST: Add a new subscriber manually from admin
export async function POST(req) {
    try {
        const body = await req.json();
        const { email } = body;

        if (!email || !email.includes("@")) {
            return NextResponse.json({ message: "유효한 이메일 주소를 입력해주세요." }, { status: 400 });
        }

        const existing = await prisma.subscriber.findUnique({ where: { email } });
        if (existing) {
            if (existing.isActive) {
                return NextResponse.json({ message: "이미 구독 중인 이메일입니다." }, { status: 400 });
            } else {
                const updated = await prisma.subscriber.update({
                    where: { email },
                    data: { isActive: true },
                });
                return NextResponse.json({ message: "구독이 다시 활성화되었습니다.", subscriber: updated });
            }
        }

        const newSubscriber = await prisma.subscriber.create({
            data: { email, isActive: true },
        });
        return NextResponse.json({ message: "구독자가 추가되었습니다.", subscriber: newSubscriber }, { status: 201 });

    } catch (error) {
        console.error("Add Subscriber Error:", error);
        return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

// DELETE: Delete a subscriber completely (or soft delete)
export async function DELETE(req) {
    try {
        const { searchParams } = new URL(req.url);
        const email = searchParams.get('email');

        if (!email) {
            return NextResponse.json({ message: "이메일이 제공되지 않았습니다." }, { status: 400 });
        }

        await prisma.subscriber.delete({
            where: { email }
        });
        return NextResponse.json({ message: "삭제 완료" });

    } catch (error) {
        console.error("Delete Subscriber Error:", error);
        return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
