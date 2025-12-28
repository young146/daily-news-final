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
            // ✅ 타임아웃 추가 (5초) - 빌드 환경에서 외부 이미지 로드 실패 방지
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
                const res = await fetch(src, { 
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0'
                    }
                });
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error('Failed to fetch image');
                buffer = await res.arrayBuffer();
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    throw new Error('Image fetch timeout');
                }
                throw fetchError;
            }
        } else if (src.startsWith('/')) {
            const filePath = path.join(process.cwd(), 'public', src);
            if (fs.existsSync(filePath)) {
                buffer = fs.readFileSync(filePath);
            }
        }

        if (buffer) {
            const base64 = Buffer.from(buffer).toString('base64');
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

    // ✅ 이미지 우선순위: WordPress 이미지 > 로컬 이미지 > 원본 이미지 > 기본 로고
    // WordPress 이미지는 이미 업로드되어 있어서 로드가 빠르고 안정적
    let imageBuffer = null;
    if (topNews?.wordpressImageUrl) {
        imageBuffer = await loadImage(topNews.wordpressImageUrl);
    }
    if (!imageBuffer && topNews?.localImagePath) {
        imageBuffer = await loadImage(topNews.localImagePath);
    }
    if (!imageBuffer && topNews?.imageUrl) {
        imageBuffer = await loadImage(topNews.imageUrl);
    }
    if (!imageBuffer) {
        imageBuffer = await loadImage('/logo-full.png');
    }

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    // ✅ 이전 구조로 복원: position 기반 레이아웃 (display 문제 없음)
    return new ImageResponse(
        (
            <div
                style={{
                    display: 'flex',
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#1f2937',
                    position: 'relative',
                }}
            >
                {/* Background Image */}
                {imageBuffer && (
                    <img
                        src={imageBuffer}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                )}

                {/* Gradient Overlay */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.9) 100%)',
                    }}
                />

                {/* Content Container */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        width: '100%',
                        height: '100%',
                        padding: '40px',
                        position: 'relative',
                        zIndex: 10,
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 32, color: '#fff', fontStyle: 'italic', fontFamily: 'serif' }}>Xin Chao</span>
                            <span style={{ fontSize: 16, color: '#fb923c', fontWeight: 'bold', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Today News</span>
                        </div>
                        <div style={{
                            padding: '8px 16px',
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            borderRadius: '999px',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'white',
                            fontSize: 16,
                        }}>
                            {today}
                        </div>
                    </div>

                    {/* Main Title */}
                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '80%' }}>
                        <div style={{
                            fontSize: 48,
                            fontWeight: 'bold',
                            color: 'white',
                            lineHeight: 1.2,
                            marginBottom: 20,
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                        }}>
                            {title}
                        </div>
                        <div style={{
                            fontSize: 24,
                            color: '#e5e7eb',
                            lineHeight: 1.4,
                            textShadow: '0 2px 5px rgba(0,0,0,0.5)',
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
        ),
        {
            ...size,
        }
    );
}
