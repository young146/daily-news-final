// app/api/promo-cards/active/route.js
// 활성화된 홍보카드만 반환 (카드뉴스 팝업 + 이메일용)
// 활성화 + 요일(weekdays) 조합 필터링 — 자세한 정책은 lib/promo-card-filters.js 참고.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { filterCardsForToday } from '@/lib/promo-card-filters';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const kind = searchParams.get('kind'); // "ad" | "self" | null(전체)
        const where = { isActive: true, ...(kind && { kind }) };

        const cards = await prisma.promoCard.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        });
        // 요일 필터 — weekdays 지정된 카드는 해당 요일에만 노출
        const todayCards = filterCardsForToday(cards);
        return NextResponse.json({ success: true, cards: todayCards });
    } catch (error) {
        console.error('[PromoCards/Active GET]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
