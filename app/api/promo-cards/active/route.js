// app/api/promo-cards/active/route.js
// 활성화된 홍보카드만 반환 (카드뉴스 팝업 + 이메일용)

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const kind = searchParams.get('kind'); // "ad" | "self" | null(전체)
        const where = { isActive: true, ...(kind && { kind }) };

        const cards = await prisma.promoCard.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        });
        return NextResponse.json({ success: true, cards });
    } catch (error) {
        console.error('[PromoCards/Active GET]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
