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
    const date = searchParams.get('date') || new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

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
                        background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                    }}
                >
                    {/* Big TEST Watermark */}
                    <div
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%) rotate(-15deg)',
                            fontSize: '200px',
                            fontWeight: 'bold',
                            color: 'rgba(255,255,255,0.1)',
                            letterSpacing: '20px',
                        }}
                    >
                        TEST
                    </div>

                    {/* Content */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            padding: '50px',
                            position: 'relative',
                        }}
                    >
                        {/* Header */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '15px',
                                }}
                            >
                                <div
                                    style={{
                                        width: '60px',
                                        height: '60px',
                                        background: 'white',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '30px',
                                    }}
                                >
                                    🇻🇳
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ color: 'white', fontSize: '36px', fontWeight: 'bold' }}>
                                        테스트 카드
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '18px' }}>
                                        SERVER-SIDE RENDERING
                                    </span>
                                </div>
                            </div>
                            <div
                                style={{
                                    background: 'white',
                                    color: '#dc2626',
                                    padding: '12px 24px',
                                    borderRadius: '30px',
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                }}
                            >
                                {date}
                            </div>
                        </div>

                        {/* Main Title */}
                        <div
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                textAlign: 'center',
                            }}
                        >
                            <div
                                style={{
                                    background: 'rgba(0,0,0,0.3)',
                                    padding: '40px 60px',
                                    borderRadius: '20px',
                                    border: '4px solid rgba(255,255,255,0.3)',
                                }}
                            >
                                <h1
                                    style={{
                                        color: 'white',
                                        fontSize: '64px',
                                        fontWeight: 'bold',
                                        margin: 0,
                                        textShadow: '3px 3px 6px rgba(0,0,0,0.3)',
                                    }}
                                >
                                    {title}
                                </h1>
                                {summary && (
                                    <p
                                        style={{
                                            color: 'rgba(255,255,255,0.9)',
                                            fontSize: '28px',
                                            marginTop: '20px',
                                        }}
                                    >
                                        {summary}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '20px',
                            }}
                        >
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    padding: '15px 30px',
                                    borderRadius: '10px',
                                    color: 'white',
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                }}
                            >
                                ✅ 한글 폰트 테스트
                            </div>
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    padding: '15px 30px',
                                    borderRadius: '10px',
                                    color: 'white',
                                    fontSize: '20px',
                                    fontWeight: 'bold',
                                }}
                            >
                                🚀 @vercel/og 사용
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
