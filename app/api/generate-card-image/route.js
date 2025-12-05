import { ImageResponse } from 'next/og';

export const runtime = 'edge';

async function loadGoogleFont(font, text) {
  const url = `https://fonts.googleapis.com/css2?family=${font}:wght@400;700;900&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype|woff2)'\)/);
  
  if (resource) {
    const response = await fetch(resource[1]);
    if (response.status === 200) {
      return await response.arrayBuffer();
    }
  }
  return null;
}

export async function GET(req) {
  try {
    const { searchParams } = req.nextUrl;
    const title = searchParams.get('title') || '오늘의 뉴스';
    const summary = searchParams.get('summary') || '';
    const date = searchParams.get('date') || new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const weather = searchParams.get('weather') || '☀️ 25°C';
    const usd = searchParams.get('usd') || '25,400';
    const krw = searchParams.get('krw') || '17.8';
    const imageUrl = searchParams.get('image') || '';

    const allText = `${title}${summary}${date}Xin Chao Vietnam오늘의 뉴스USDKRW서울`;
    
    let fontData;
    try {
      fontData = await loadGoogleFont('Noto+Sans+KR', allText);
    } catch (e) {
      console.log('Font load failed, using default');
    }

    const fontConfig = fontData ? {
      fonts: [
        {
          name: 'Noto Sans KR',
          data: fontData,
          style: 'normal',
          weight: 700,
        },
      ],
    } : {};

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0f172a',
            fontFamily: 'Noto Sans KR, sans-serif',
            position: 'relative',
          }}
        >
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
          
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'linear-gradient(to bottom, rgba(15,23,42,0.3) 0%, rgba(15,23,42,0.7) 50%, rgba(15,23,42,0.95) 100%)',
              display: 'flex',
            }}
          />

          <div
            style={{
              position: 'absolute',
              top: 24,
              left: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span style={{ color: 'white', fontSize: 28, fontWeight: 700 }}>Xin Chao Vietnam</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>오늘의 뉴스</span>
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              top: 32,
              right: 40,
              backgroundColor: '#ef4444',
              color: 'white',
              padding: '8px 20px',
              borderRadius: 20,
              fontSize: 16,
              fontWeight: 700,
              display: 'flex',
            }}
          >
            {date}
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: 140,
              left: 40,
              right: 40,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: 48,
                fontWeight: 900,
                color: 'white',
                lineHeight: 1.2,
                textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                display: 'flex',
                flexWrap: 'wrap',
              }}
            >
              {title.length > 50 ? title.substring(0, 50) + '...' : title}
            </div>
            
            {summary && (
              <div
                style={{
                  fontSize: 22,
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: 1.5,
                  display: 'flex',
                  flexWrap: 'wrap',
                }}
              >
                {summary.length > 100 ? summary.substring(0, 100) + '...' : summary}
              </div>
            )}
          </div>

          <svg
            style={{
              position: 'absolute',
              bottom: 80,
              left: 0,
              width: '100%',
              height: 50,
            }}
            viewBox="0 0 1200 50"
            preserveAspectRatio="none"
          >
            <path
              d="M0,25 Q300,0 600,25 T1200,25 L1200,50 L0,50 Z"
              fill="white"
            />
          </svg>

          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 80,
              backgroundColor: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 40px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>XinChao</span>
              <span style={{ fontSize: 24, fontWeight: 400, color: '#64748b' }}>Vietnam</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, color: '#64748b' }}>서울</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{weather}</span>
              </div>

              <div style={{ width: 1, height: 32, backgroundColor: '#e2e8f0', display: 'flex' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: 4, display: 'flex' }}>USD</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{usd}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: 4, display: 'flex' }}>KRW</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{krw}</span>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        ...fontConfig,
      }
    );
  } catch (e) {
    console.error('Image generation error:', e);
    return new Response(`Failed to generate image: ${e.message}`, {
      status: 500,
    });
  }
}
