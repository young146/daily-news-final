import { ImageResponse } from 'next/og';
import prisma from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const alt = 'Xin Chao Daily News';
export const size = {
    width: 1200,
    height: 630,
};
export const contentType = 'image/png';

async function loadImage(src) {
    try {
        if (!src) return null;
        let buffer;
        if (src.startsWith('http')) {
            const res = await fetch(src);
            if (!res.ok) throw new Error('Failed to fetch image');
            buffer = await res.arrayBuffer();
        } else if (src.startsWith('/')) {
            const filePath = path.join(process.cwd(), 'public', src);
            if (fs.existsSync(filePath)) {
                buffer = fs.readFileSync(filePath);
            }
        }

        if (buffer) {
            const base64 = Buffer.from(buffer).toString('base64');
            // Assume PNG for simplicity, or detect mime type if needed. 
            // Most images here are likely PNG or JPG.
            const mimeType = src.endsWith('.jpg') || src.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
            return `data:${mimeType};base64,${base64}`;
        }
        return null;
    } catch (e) {
        console.error(`Failed to load image ${src}:`, e);
        return null;
    }
}

export default async function Image() {
    let topNews;
    try {
        topNews = await prisma.newsItem.findFirst({
            where: {
                isPublishedDaily: true,
                isTopNews: true
            },
            orderBy: { publishedAt: 'desc' },
        });
    } catch (error) {
        console.error('Failed to fetch top news for OG image:', error);
    }

    const title = topNews?.translatedTitle || topNews?.title || 'Xin Chao Daily News';
    const summary = topNews?.translatedSummary || topNews?.summary || 'Vietnam & Korea Daily News Updates';

    let imageUrl = topNews?.imageUrl || '/logo-full.png';
    let imageBuffer = await loadImage(imageUrl);

    if (!imageBuffer) {
        imageBuffer = await loadImage('/logo-full.png');
    }

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    return new ImageResponse(
        (
            <div
                style={{
                    display: 'flex',
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#ffffff',
                    position: 'relative',
                    border: '1px solid #e5e7eb', // 흰색 테두리
                }}
            >
                {/* Card Container */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%',
                        height: '100%',
                    }}
                >
                    {/* Top Section - Image */}
                    <div
                        style={{
                            width: '100%',
                            height: '50%',
                            position: 'relative',
                            backgroundColor: '#f3f4f6',
                            overflow: 'hidden',
                        }}
                    >
                        {imageBuffer && (
                            <img
                                src={imageBuffer}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                }}
                            />
                        )}
                        {/* Header Overlay */}
                        <div
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                padding: '30px 40px',
                                background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)',
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 28, color: '#fff', fontStyle: 'italic', fontFamily: 'serif' }}>Xin Chao</span>
                                <span style={{ fontSize: 14, color: '#fb923c', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Today News</span>
                            </div>
                            <div style={{
                                padding: '6px 14px',
                                backgroundColor: 'rgba(0,0,0,0.6)',
                                borderRadius: '999px',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: 'white',
                                fontSize: 14,
                            }}>
                                {today}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Section - Text with Light Background */}
                    <div
                        style={{
                            width: '100%',
                            height: '50%',
                            backgroundColor: '#f9fafb', // 옅은 배경색
                            borderTop: '1px solid #e5e7eb', // 구분선
                            padding: '40px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                        }}
                    >
                        {/* Main Title */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                fontSize: 42,
                                fontWeight: 'bold',
                                color: '#111827',
                                lineHeight: 1.2,
                                marginBottom: 16,
                            }}>
                                {title}
                            </div>
                            <div style={{
                                fontSize: 20,
                                color: '#374151',
                                lineHeight: 1.4,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}>
                                {summary}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
