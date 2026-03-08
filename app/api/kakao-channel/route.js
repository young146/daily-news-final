import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

const KAKAO_ADMIN_KEY = process.env.KAKAO_ADMIN_KEY;
// pf.kakao.com/_vaUWd → channel public ID is _vaUWd
const CHANNEL_PUBLIC_ID = '_vaUWd';

/**
 * 카카오 채널에 메시지 발송
 * POST /api/kakao-channel
 * body: { newsUrl, cardImageUrl, newsTitle, promoCards }
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { newsUrl, cardImageUrl, newsTitle, promoCards } = body;

        if (!KAKAO_ADMIN_KEY) {
            return NextResponse.json({ success: false, error: 'KAKAO_ADMIN_KEY not set' }, { status: 500 });
        }

        const results = [];

        // 1. 뉴스 카드 메시지 발송
        const newsMessage = buildFeedMessage({
            title: newsTitle || '씬짜오베트남 데일리뉴스',
            description: '오늘의 베트남 뉴스를 확인하세요!',
            imageUrl: cardImageUrl,
            linkUrl: newsUrl,
            buttonLabel: '뉴스 보기',
        });

        const newsResult = await sendChannelMessage(newsMessage);
        results.push({ type: 'news', ...newsResult });

        // 2. 홍보카드 메시지 발송 (5초 후)
        if (promoCards && promoCards.length > 0) {
            await sleep(5000);
            for (const card of promoCards) {
                const ytMatch = card.videoUrl?.match(/(?:youtube\.com.*v=|youtu\.be\/)([^&\n?#]+)/);
                const ytId = ytMatch ? ytMatch[1] : null;
                const imgSrc = card.imageUrl || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null);

                const promoMessage = buildFeedMessage({
                    title: card.title,
                    description: card.description || '',
                    imageUrl: imgSrc,
                    linkUrl: card.linkUrl || newsUrl,
                    buttonLabel: '참여하기',
                });

                const promoResult = await sendChannelMessage(promoMessage);
                results.push({ type: 'promo', cardId: card.id, ...promoResult });

                await sleep(2000); // 홍보카드 간 2초 간격
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (error) {
        console.error('[KakaoChannel] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

async function sendChannelMessage(message) {
    const url = `https://kapi.kakao.com/v1/api/talk/channels/${CHANNEL_PUBLIC_ID}/message/send`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `KakaoAK ${KAKAO_ADMIN_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            template_object: JSON.stringify(message),
        }),
    });

    const data = await response.json();
    return {
        status: response.status,
        ok: response.ok,
        data,
    };
}

function buildFeedMessage({ title, description, imageUrl, linkUrl, buttonLabel }) {
    return {
        object_type: 'feed',
        content: {
            title,
            description,
            image_url: imageUrl,
            link: {
                web_url: linkUrl,
                mobile_web_url: linkUrl,
            },
        },
        buttons: [
            {
                title: buttonLabel,
                link: {
                    web_url: linkUrl,
                    mobile_web_url: linkUrl,
                },
            },
        ],
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
