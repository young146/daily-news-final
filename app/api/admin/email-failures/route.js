import prisma from '@/lib/prisma';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const logId = searchParams.get('logId');

        let failures;
        if (logId) {
            failures = await prisma.emailSendDetail.findMany({
                where: { logId: parseInt(logId), status: 'failed' },
                orderBy: { email: 'asc' },
            });
        } else {
            // 최근 7일간의 전체 실패 목록
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            failures = await prisma.emailSendDetail.findMany({
                where: { status: 'failed', sentAt: { gte: sevenDaysAgo } },
                orderBy: { sentAt: 'desc' },
            });
        }

        return Response.json({ success: true, failures });
    } catch (error) {
        console.error('[EmailFailures GET]', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const body = await request.json();
        const { emails } = body;

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return Response.json({ success: false, error: '이메일 목록이 필요합니다.' }, { status: 400 });
        }

        const result = await prisma.subscriber.updateMany({
            where: { email: { in: emails } },
            data: { isActive: false },
        });

        return Response.json({
            success: true,
            message: `${result.count}개의 이메일이 비활성화 되었습니다.`
        });
    } catch (error) {
        console.error('[EmailFailures PATCH]', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
}
