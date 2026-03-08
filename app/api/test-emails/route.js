import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

// GET: 테스트 이메일 목록 조회
export async function GET() {
    try {
        const emails = await prisma.testEmail.findMany({
            orderBy: { createdAt: 'asc' }
        });
        return Response.json({ success: true, emails });
    } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: 테스트 이메일 추가
export async function POST(request) {
    try {
        const { email, name } = await request.json();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return Response.json({ success: false, error: '유효하지 않은 이메일 주소입니다.' }, { status: 400 });
        }
        const created = await prisma.testEmail.create({
            data: { email: email.trim(), name: name?.trim() || null }
        });
        return Response.json({ success: true, email: created });
    } catch (error) {
        if (error.code === 'P2002') {
            return Response.json({ success: false, error: '이미 등록된 이메일입니다.' }, { status: 409 });
        }
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
}
