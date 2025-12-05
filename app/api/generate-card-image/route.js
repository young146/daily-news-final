import { ImageResponse } from '@vercel/og';

export async function GET(request) {
    const now = new Date();
    const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = vietnamTime.getFullYear();
    const month = vietnamTime.getMonth() + 1;
    const day = vietnamTime.getDate();
    const hours = vietnamTime.getHours();
    const minutes = vietnamTime.getMinutes().toString().padStart(2, '0');
    const weekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const weekday = weekdays[vietnamTime.getDay()];
    const dateStr = `${year}년 ${month}월 ${day}일 ${weekday} ${hours}:${minutes}`;

    try {
        return new ImageResponse(
            (
                <div
                    style={{
                        width: '1200px',
                        height: '630px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
                        fontFamily: 'sans-serif',
                        position: 'relative',
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            top: '40px',
                            left: '50px',
                            color: '#fb923c',
                            fontSize: '72px',
                            fontWeight: 'bold',
                            textDecoration: 'underline',
                        }}
                    >
                        {dateStr}
                    </div>
                    <h1
                        style={{
                            color: 'white',
                            fontSize: '80px',
                            fontWeight: 'bold',
                            margin: 0,
                            textAlign: 'center',
                        }}
                    >
                        씬짜오 오늘의 뉴스
                    </h1>
                    <p
                        style={{
                            color: 'white',
                            fontSize: '80px',
                            marginTop: '30px',
                            textAlign: 'center',
                            fontWeight: 'bold',
                        }}
                    >
                        XinChao Today's News
                    </p>
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
