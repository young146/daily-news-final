import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET: Fetch subscribers (페이지네이션)
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(10000, parseInt(searchParams.get('limit') || '100')); // 10000까지 허용 (전체 다운로드용)
        const search = searchParams.get('search') || '';
        const status = searchParams.get('status') || 'all';

        const baseWhere = search
            ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } }, { company: { contains: search, mode: 'insensitive' } }] }
            : {};

        const where = { ...baseWhere };
        if (status === 'active') where.isActive = true;
        if (status === 'inactive') where.isActive = false;
        // 분류 필터 (고객/일반/기업디렉토리) — category 기준
        if (status === 'customer') where.category = 'customer';
        if (status === 'general') where.category = 'general';
        if (status === 'directory') where.category = 'directory';

        const [subscribers, total] = await Promise.all([
            prisma.subscriber.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.subscriber.count({ where }),
        ]);

        return NextResponse.json({ subscribers, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error("Fetch Subscribers Error:", error);
        return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}


// POST: Add a new subscriber (single or bulk import)
export async function POST(req) {
    try {
        const body = await req.json();

        // Bulk import: { subscribers: [{email, company, name, phone, isCustomer?}, ...], defaultIsCustomer?: boolean }
        if (body.subscribers) {
            const defaultIsCustomer = body.defaultIsCustomer === true;
            let added = 0, updated = 0, skipped = 0, promotedToCustomer = 0;
            for (const item of body.subscribers) {
                const { company, name, phone } = item;
                const email = item.email ? item.email.trim() : null;
                if (!email || !email.includes("@")) { skipped++; continue; }
                // 명시적 isCustomer 우선, 없으면 일괄 default. 모두 미지정이면 false.
                const isCustomer = (item.isCustomer === true) || (item.isCustomer === undefined && defaultIsCustomer);
                try {
                    const existing = await prisma.subscriber.findUnique({ where: { email } });
                    if (existing) {
                        // 기존 row: isCustomer 는 한 번 true 되면 유지 (downgrade 방지)
                        const nextIsCustomer = existing.isCustomer || isCustomer;
                        const justPromoted = !existing.isCustomer && nextIsCustomer;
                        await prisma.subscriber.update({
                            where: { email },
                            data: {
                                isActive: true,
                                company: company || existing.company,
                                name: name || existing.name,
                                phone: phone || existing.phone,
                                isCustomer: nextIsCustomer,
                                // 고객이 되면 category=customer 로 승격(기존 directory/general 덮음)
                                ...(nextIsCustomer ? { category: 'customer' } : {}),
                            }
                        });
                        if (justPromoted) promotedToCustomer++;
                        else updated++;
                    } else {
                        await prisma.subscriber.create({
                            data: { email, company, name, phone, isActive: true, isCustomer, category: isCustomer ? 'customer' : 'general' }
                        });
                        added++;
                    }
                } catch (e) {
                    console.error("Insert error:", e.message);
                    skipped++;
                }
            }
            return NextResponse.json({
                message: `완료! 신규: ${added}, 업데이트: ${updated}, 고객 승격: ${promotedToCustomer}, 스킵: ${skipped}`,
                added, updated, promotedToCustomer, skipped,
            });
        }

        // Single add
        const { company, name, phone } = body;
        const email = body.email ? body.email.trim() : null;

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

// PUT: Toggle active status (single or bulk)
export async function PUT(req) {
    try {
        const body = await req.json();

        // Bulk toggle
        if (body.ids && Array.isArray(body.ids)) {
            const { ids, isActive } = body;
            const result = await prisma.subscriber.updateMany({
                where: { id: { in: ids } },
                data: { isActive: isActive }
            });
            return NextResponse.json({
                message: `${result.count}명의 상태를 ${isActive ? '활성화' : '비활성화'}로 변경했습니다.`,
                updated: result.count
            });
        }

        // Single toggle or Edit update
        if (body.id) {
            const { id, isActive, email, name, company, phone, category } = body;
            const updateData = {};

            if (isActive !== undefined) updateData.isActive = isActive;
            if (email !== undefined) {
                const cleanEmail = String(email).trim();
                // 서버측 이메일 형식 검증 (깨진 주소 재유입 방지)
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
                    return NextResponse.json({ message: `이메일 형식이 올바르지 않습니다: ${cleanEmail}` }, { status: 400 });
                }
                // Check if the new email already exists for another subscriber
                const existing = await prisma.subscriber.findUnique({ where: { email: cleanEmail } });
                if (existing && existing.id !== id) {
                    return NextResponse.json({ message: "이미 사용 중인 이메일입니다." }, { status: 400 });
                }
                updateData.email = cleanEmail;
            }
            if (name !== undefined) updateData.name = name;
            if (company !== undefined) updateData.company = company;
            if (phone !== undefined) updateData.phone = phone;
            // 분류 수동 변경 — isCustomer 도 동기화 (customer=true, 그 외 false)
            if (category !== undefined && ['customer', 'general', 'directory'].includes(category)) {
                updateData.category = category;
                updateData.isCustomer = category === 'customer';
            }

            const updated = await prisma.subscriber.update({
                where: { id },
                data: updateData
            });

            const message = isActive !== undefined && email === undefined
                ? `상태가 ${isActive ? '활성' : '취소됨'}(으)로 변경되었습니다.`
                : "구독자 정보가 수정되었습니다.";

            return NextResponse.json({
                message,
                subscriber: updated
            });
        }

        return NextResponse.json({ message: "잘못된 요청입니다. (id 또는 ids 누락)" }, { status: 400 });

    } catch (error) {
        console.error("Update Subscriber Status Error:", error);
        return NextResponse.json({ message: "서버 오류가 발생했습니다." }, { status: 500 });
    }
}
