import { ImageResponse } from '@vercel/og';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || '오늘의 뉴스';
    const summary = searchParams.get('summary') || '';
    const imageUrl = searchParams.get('image') || '';
    const date = searchParams.get('date') || new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const weather = searchParams.get('weather') || '25';
    const usd = searchParams.get('usd') || '25,400';
    const krw = searchParams.get('krw') || '17.8';

    try {
        return new ImageResponse(
            (
                <div
                    style={{
                        width: '1200px',
                        height: '630px',
                        display: 'flex',
                        flexDirection: 'column',
                        fontFamily: 'sans-serif',
                        position: 'relative',
                        overflow: 'hidden',
                        background: '#0f172a',
                    }}
                >
                    {/* Background Image with Overlay */}
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
                    
                    {/* Dark Gradient Overlay */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.6) 0%, rgba(15, 23, 42, 0.85) 100%)',
                        }}
                    />

                    {/* Content Container */}
                    <div
                        style={{
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            padding: '40px 50px',
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
                                    fontSize: title.length > 30 ? '48px' : '56px',
                                    fontWeight: 'bold',
                                    lineHeight: 1.2,
                                    margin: 0,
                                    textShadow: '2px 2px 8px rgba(0,0,0,0.5)',
                                }}
                            >
                                {title.length > 50 ? title.substring(0, 50) + '...' : title}
                            </h1>
                            {summary && (
                                <p
                                    style={{
                                        color: '#cbd5e1',
                                        fontSize: '22px',
                                        marginTop: '20px',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {summary.length > 100 ? summary.substring(0, 100) + '...' : summary}
                                </p>
                            )}
                        </div>

                        {/* Footer */}
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                marginTop: 'auto',
                            }}
                        >
                            {/* Wave Separator Line */}
                            <div
                                style={{
                                    width: '100%',
                                    height: '2px',
                                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                                    marginBottom: '20px',
                                }}
                            />

                            {/* Footer Info Bar */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'rgba(255,255,255,0.95)',
                                    padding: '16px 28px',
                                    borderRadius: '12px',
                                }}
                            >
                                {/* Logo */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>
                                        XinChao
                                    </span>
                                    <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#3b82f6' }}>
                                        Vietnam
                                    </span>
                                </div>

                                {/* Info Section */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                                    {/* Weather */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '14px', color: '#64748b' }}>서울</span>
                                        <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{weather}°C</span>
                                    </div>

                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />

                                    {/* USD */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>USD</span>
                                        <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{usd}</span>
                                    </div>

                                    {/* KRW */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
            }
        );
    } catch (e) {
        console.error('Error generating image:', e);
        return new Response(JSON.stringify({ error: 'Failed to generate image', details: e.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
