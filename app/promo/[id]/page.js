// app/promo/[id]/page.js
// 홍보카드 랜딩 페이지 - OG 메타태그로 카카오톡 미리보기 이미지 지원

import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';

// ─── OG 메타태그 (카카오톡 링크 미리보기용) ───
export async function generateMetadata({ params }) {
    const { id } = await params;
    const card = await prisma.promoCard.findUnique({ where: { id: parseInt(id) } });
    if (!card) return { title: '씬짜오베트남 홍보' };

    const siteUrl = 'https://chaovietnam.co.kr';
    return {
        title: card.title,
        description: card.description || card.title,
        openGraph: {
            title: card.title,
            description: card.description || card.title,
            url: `${siteUrl}/promo/${id}`,
            siteName: '씬짜오베트남',
            images: card.imageUrl
                ? [{ url: card.imageUrl, width: 800, height: 600, alt: card.title }]
                : [],
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: card.title,
            description: card.description || card.title,
            images: card.imageUrl ? [card.imageUrl] : [],
        },
    };
}

// ─── 페이지 본문 ───
export default async function PromoPage({ params }) {
    const { id } = await params;
    const card = await prisma.promoCard.findUnique({ where: { id: parseInt(id) } });

    // 카드가 없으면 홈으로
    if (!card) redirect('/');

    const siteUrl = 'https://chaovietnam.co.kr';

    return (
        <html lang="ko">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                {/* 카카오톡 캐시 방지용 */}
                <meta httpEquiv="Cache-Control" content="no-cache" />
            </head>
            <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                <div style={{ maxWidth: '480px', width: '100%', background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', margin: '20px' }}>
                    {/* 씬짜오 헤더 */}
                    <div style={{ background: '#f97316', padding: '14px 20px' }}>
                        <p style={{ margin: 0, color: 'white', fontWeight: 'bold', fontSize: '14px' }}>📣 씬짜오베트남 홍보</p>
                    </div>

                    {/* 홍보 이미지 */}
                    {card.imageUrl && (
                        <img
                            src={card.imageUrl}
                            alt={card.title}
                            style={{ width: '100%', display: 'block', objectFit: 'contain', background: '#f8f8f8', maxHeight: '300px' }}
                        />
                    )}

                    {/* 내용 */}
                    <div style={{ padding: '20px' }}>
                        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                            {card.title}
                        </h1>
                        {card.description && (
                            <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '0 0 20px 0' }}>
                                {card.description}
                            </p>
                        )}

                        {/* 자세히 보기 버튼 → 실제 linkUrl 로 이동 */}
                        <a
                            href={card.linkUrl}
                            style={{
                                display: 'block', textAlign: 'center', padding: '14px',
                                background: '#f97316', color: 'white', borderRadius: '10px',
                                textDecoration: 'none', fontWeight: 'bold', fontSize: '16px',
                            }}
                        >
                            자세히 보기 →
                        </a>

                        <p style={{ textAlign: 'center', fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
                            씬짜오베트남 | <a href={siteUrl} style={{ color: '#9ca3af' }}>chaovietnam.co.kr</a>
                        </p>
                    </div>
                </div>
            </body>
        </html>
    );
}
