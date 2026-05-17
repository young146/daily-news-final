// app/api/promo-cards/route.js
// GET: 전체 목록, POST: 새 카드 생성

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const kind = searchParams.get('kind'); // "ad" | "self" | null(전체)
        const where = kind ? { kind } : {};

        const cards = await prisma.promoCard.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        });
        return NextResponse.json({ success: true, cards });
    } catch (error) {
        console.error('[PromoCards GET]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { title, description, imageUrl, videoUrl, linkUrl, isActive, sortOrder, kind, category } = body;

        if (!title || !linkUrl) {
            return NextResponse.json({ error: '제목과 링크 URL은 필수입니다.' }, { status: 400 });
        }

        const card = await prisma.promoCard.create({
            data: {
                title,
                description: description || null,
                imageUrl: imageUrl || null,
                videoUrl: videoUrl || null,
                linkUrl,
                isActive: isActive !== false,
                sortOrder: sortOrder || 0,
                kind: kind === 'self' ? 'self' : 'ad',
                category: category || null,
            },
        });

        return NextResponse.json({ success: true, card });
    } catch (error) {
        console.error('[PromoCards POST]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
