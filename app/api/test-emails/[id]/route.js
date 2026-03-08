import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

// DELETE: 테스트 이메일 삭제
export async function DELETE(request, { params }) {
    try {
        const { id } = await params;
        await prisma.testEmail.delete({ where: { id: parseInt(id) } });
        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
}
