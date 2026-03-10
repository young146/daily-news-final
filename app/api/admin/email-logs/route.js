import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';


export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    try {
        const [logs, total] = await Promise.all([
            prisma.emailSendLog.findMany({
                orderBy: { sentAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.emailSendLog.count(),
        ]);

        return NextResponse.json({
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error('EmailSendLog 조회 실패:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
