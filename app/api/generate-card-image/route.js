import { ImageResponse } from '@vercel/og';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

async function loadNotoSansKR() {
    const fontUrl = 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-kr@latest/korean-700-normal.woff';
    try {
        const response = await fetch(fontUrl);
        if (response.ok) {
            return await response.arrayBuffer();
        }
    } catch (e) {
        console.error('Failed to load font:', e);
    }
    return null;
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || '오늘의 뉴스';
    const summary = searchParams.get('summary') || '';
    const imageUrl = searchParams.get('image') || '';
    const date = searchParams.get('date') || new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const weather = searchParams.get('weather') || '25°C';
    const usd = searchParams.get('usd') || '25,400';
    const krw = searchParams.get('krw') || '17.8';

    const fontData = await loadNotoSansKR();

    try {
        return new ImageResponse(
            (
                <div
                    style={{
                        width: '1200px',
                        height: '630px',
                        display: 'flex',
                        flexDirection: 'column',
                        fontFamily: '"Noto Sans KR", sans-serif',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Background Image */}
                    {imageUrl && (
                        <img
                            src={imageUrl}
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
                    
                    {/* Dark Overlay */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: imageUrl 
                                ? 'linear-gradient(to bottom, rgba(15, 23, 42, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)'
                                : '#0f172a',
                        }}
                    />

                    {/* Content Container */}
                    <div
                        style={{
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            padding: '40px 60px',
                        }}
                    >
                        {/* Header */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                            }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ color: 'white', fontSize: '32px', fontWeight: 'bold' }}>
                                    Xin Chao Vietnam
                                </span>
                                <span style={{ color: '#94a3b8', fontSize: '18px', marginTop: '4px' }}>
                                    오늘의 뉴스
                                </span>
                            </div>
                            <div
                                style={{
                                    background: 'linear-gradient(135deg, #f43f5e, #ec4899)',
                                    color: 'white',
                                    padding: '10px 20px',
                                    borderRadius: '25px',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                }}
                            >
                                {date}
                            </div>
                        </div>

                        {/* Main Content - Title & Summary */}
                        <div
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                marginTop: '20px',
                            }}
                        >
                            <h1
                                style={{
                                    color: 'white',
                                    fontSize: '56px',
                                    fontWeight: 'bold',
                                    lineHeight: 1.2,
                                    margin: 0,
                                    textShadow: '2px 2px 8px rgba(0,0,0,0.5)',
                                }}
                            >
                                {title.length > 40 ? title.substring(0, 40) + '...' : title}
                            </h1>
                            {summary && (
                                <p
                                    style={{
                                        color: '#cbd5e1',
                                        fontSize: '24px',
                                        marginTop: '20px',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {summary.length > 80 ? summary.substring(0, 80) + '...' : summary}
                                </p>
                            )}
                        </div>

                        {/* Footer with Wave */}
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                marginTop: 'auto',
                            }}
                        >
                            {/* Wave Separator */}
                            <svg
                                viewBox="0 0 1200 50"
                                style={{ width: '100%', height: '30px', marginBottom: '15px' }}
                            >
                                <path
                                    d="M0,25 Q150,0 300,25 T600,25 T900,25 T1200,25 L1200,50 L0,50 Z"
                                    fill="white"
                                    opacity="0.15"
                                />
                            </svg>

                            {/* Footer Info */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'rgba(255,255,255,0.95)',
                                    padding: '15px 30px',
                                    borderRadius: '12px',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>
                                        XinChao
                                    </span>
                                    <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#3b82f6' }}>
                                        Vietnam
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                                    {/* Weather */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '14px', color: '#64748b' }}>서울</span>
                                        <span style={{ fontSize: '18px' }}>☀️</span>
                                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{weather}</span>
                                    </div>

                                    {/* USD */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>USD</span>
                                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{usd}</span>
                                    </div>

                                    {/* KRW */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>KRW</span>
                                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{krw}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
                fonts: fontData ? [
                    {
                        name: 'Noto Sans KR',
                        data: fontData,
                        weight: 700,
                        style: 'normal',
                    },
                ] : [],
            }
        );
    } catch (e) {
        console.error('Error generating image:', e);
        return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
    }
}
