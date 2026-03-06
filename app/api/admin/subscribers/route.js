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
        return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

// POST: Add a new subscriber (single or bulk import)
export async function POST(req) {
    try {
        const body = await req.json();

        // Bulk import: { subscribers: [{email, company, name, phone}, ...] }
        if (body.subscribers) {
            let added = 0, skipped = 0;
            for (const item of body.subscribers) {
                const { email, company, name, phone } = item;
                if (!email || !email.includes("@")) { skipped++; continue; }
                try {
                    const existing = await prisma.subscriber.findUnique({ where: { email } });
                    if (existing) {
                        await prisma.subscriber.update({
                            where: { email },
                            data: {
                                isActive: true,
                                company: company || existing.company,
                                name: name || existing.name,
                                phone: phone || existing.phone,
                            }
                        });
                        skipped++;
                    } else {
                        await prisma.subscriber.create({
                            data: { email, company, name, phone, isActive: true }
                        });
                        added++;
                    }
                } catch (e) {
                    console.error("Insert error:", e.message);
                    skipped++;
                }
            }
            return NextResponse.json({ message: `완료! 추가: ${added}명, 중복: ${skipped}명`, added, skipped });
        }

        // Single add
        const { email, company, name, phone } = body;
        if (!email || !email.includes("@")) {
            return NextResponse.json({ message: "유효한 이메일 주소를 입력해주세요." }, { status: 400 });
        }

        const existing = await prisma.subscriber.findUnique({ where: { email } });
        if (existing) {
            if (existing.isActive) {
                return NextResponse.json({ message: "이미 구독 중인 이메일입니다." }, { status: 400 });
            }
            const updated = await prisma.subscriber.update({
                where: { email },
                data: { isActive: true, company, name, phone }
            });
            return NextResponse.json({ message: "구독이 다시 활성화되었습니다.", subscriber: updated });
        }

        const newSubscriber = await prisma.subscriber.create({
            data: { email, company, name, phone, isActive: true }
        });
        return NextResponse.json({ message: "구독자가 추가되었습니다.", subscriber: newSubscriber }, { status: 201 });

    } catch (error) {
        console.error("Add Subscriber Error:", error);
        return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

// DELETE: Delete one (email param) or bulk (ids in body)
export async function DELETE(req) {
    try {
        const { searchParams } = new URL(req.url);
        const email = searchParams.get('email');

        if (email) {
            await prisma.subscriber.delete({ where: { email } });
            return NextResponse.json({ message: "삭제 완료" });
        }

        const body = await req.json();
        if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
            const result = await prisma.subscriber.deleteMany({ where: { id: { in: body.ids } } });
            return NextResponse.json({ message: `${result.count}명 삭제 완료`, deleted: result.count });
        }

        return NextResponse.json({ message: "삭제할 항목이 없습니다." }, { status: 400 });
    } catch (error) {
        console.error("Delete Subscriber Error:", error);
        return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}

// PATCH: Clean up invalid (garbled) email entries
export async function PATCH() {
    try {
        const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
        const all = await prisma.subscriber.findMany({ select: { id: true, email: true } });
        const invalid = all.filter(s => !emailRegex.test(s.email));
        if (invalid.length === 0) {
            return NextResponse.json({ message: "정리할 항목이 없습니다.", deleted: 0 });
        }
        await prisma.subscriber.deleteMany({ where: { id: { in: invalid.map(s => s.id) } } });
        return NextResponse.json({ message: `${invalid.length}개의 잘못된 항목을 삭제했습니다.`, deleted: invalid.length });
    } catch (error) {
        console.error("Cleanup Error:", error);
        return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
