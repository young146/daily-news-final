// app/api/promo-cards/[id]/route.js
// GET: 단일 카드 조회, PUT: 수정, DELETE: 삭제

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request, context) {
    try {
        const { id: rawId } = await context.params;
        const id = parseInt(rawId);
        const card = await prisma.promoCard.findUnique({ where: { id } });
        if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true, card });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request, context) {
    try {
        const { id: rawId } = await context.params;
        const id = parseInt(rawId);
        const body = await request.json();
        const { title, description, imageUrl, videoUrl, linkUrl, isActive, sortOrder } = body;

        const card = await prisma.promoCard.update({
            where: { id },
            data: {
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(imageUrl !== undefined && { imageUrl }),
                ...(videoUrl !== undefined && { videoUrl }),
                ...(linkUrl !== undefined && { linkUrl }),
                ...(isActive !== undefined && { isActive }),
                ...(sortOrder !== undefined && { sortOrder }),
            },
        });

        return NextResponse.json({ success: true, card });
    } catch (error) {
        console.error('[PromoCards PUT]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, context) {
    try {
        const { id: rawId } = await context.params;
        const id = parseInt(rawId);
        await prisma.promoCard.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[PromoCards DELETE]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
