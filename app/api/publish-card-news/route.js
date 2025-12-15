import prisma from '@/lib/prisma';
import { publishCardNewsToWordPress, uploadImageToWordPress } from '@/lib/publisher';
import { getSeoulWeather, getExchangeRates } from '@/lib/external-data';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        console.log('[CardNews API] Received publish request...');

        // Content-Type 먼저 확인
        const contentType = request.headers.get('content-type') || '';
        let body = {};
        let imageBuffer = null;

        // 요청 본문 파싱 (JSON 또는 FormData)
        if (contentType.includes('application/json')) {
            // JSON 요청인 경우
            body = await request.json();
            console.log('[CardNews API] Received JSON body:', body);
        } else if (contentType.includes('multipart/form-data')) {
            // FormData 요청인 경우 (이미지 업로드)
            console.log('[CardNews API] Handling multipart form data...');
            const formData = await request.formData();
            const file = formData.get('image');
            const topNewsIdParam = formData.get('topNewsId');

            if (file) {
                console.log('[CardNews API] Client uploaded image found.');
                const arrayBuffer = await file.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
            }

            if (topNewsIdParam) {
                body.topNewsId = topNewsIdParam;
            }
        }

        // 1. Get Top News Info (선택된 탑뉴스 ID가 있으면 해당 뉴스 사용)
        let topNews;
        if (body.topNewsId) {
            topNews = await prisma.newsItem.findUnique({
                where: { id: body.topNewsId }
            });
            console.log(`[CardNews API] Using selected top news: ${topNews?.title || 'Not found'}`);
        }
        
        // 선택된 뉴스가 없거나 찾을 수 없으면 기본 탑뉴스 사용
        if (!topNews) {
            topNews = await prisma.newsItem.findFirst({
                where: { isTopNews: true },
                orderBy: { publishedAt: 'desc' }
            });
            console.log(`[CardNews API] Using default top news: ${topNews?.title || 'Not found'}`);
        }

        if (!topNews) {
            return new Response(JSON.stringify({
                success: false,
                error: '탑뉴스를 찾을 수 없습니다. 먼저 탑뉴스를 선택해주세요.'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const title = topNews.translatedTitle || topNews.title || 'Daily News Card';
        const dateStr = new Date().toISOString().split('T')[0];

        // 2. 이미지가 업로드되지 않았으면 서버에서 생성
        // (이미 위에서 FormData 처리 완료, imageBuffer가 null이면 서버에서 생성)
        if (!imageBuffer) {
            console.log('[CardNews API] No image uploaded, generating server-side...');

            if (!topNews) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'No top news selected for auto-generation'
                }), { status: 400 });
            }

            const weather = await getSeoulWeather();
            const rates = await getExchangeRates();

            const summary = topNews.translatedSummary || topNews.summary || '';
            let imageUrl = topNews.imageUrl || '';
            
            // 원본 이미지 접근이 막혀 있을 경우 대비: 사전 확인 후 실패 시 그라디언트 배경 사용
            if (imageUrl) {
                try {
                    const imgResp = await fetch(imageUrl, { method: 'GET' });
                    const imgType = imgResp.headers.get('content-type') || '';
                    if (!imgResp.ok || !imgType.startsWith('image/')) {
                        console.warn(`[CardNews API] Image fetch failed (${imgResp.status}) or non-image type (${imgType}). Fallback to gradient.`);
                        imageUrl = '';
                    } else {
                        console.log('[CardNews API] Image fetch ok:', imgType);
                    }
                } catch (e) {
                    console.warn('[CardNews API] Image fetch error, fallback to gradient:', e.message);
                    imageUrl = '';
                }
            }
            
            console.log(`[CardNews API] Using top news image: ${imageUrl ? imageUrl.substring(0, 60) + '...' : 'none'}`);

            // ... (keep existing image upload logic if needed, or simplify) ...
            // For brevity, skipping the re-upload of background image since we are generating

            const weatherTemp = weather?.temp ?? '25';
            const usdRate = rates?.usdVnd?.toLocaleString() ?? '25,400';
            const krwRate = rates?.krwVnd?.toLocaleString() ?? '17.8';

            const params = new URLSearchParams({
                title,
                summary,
                image: imageUrl,
                weather: String(weatherTemp),
                usd: String(usdRate),
                krw: String(krwRate)
            });

            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'; // Default to 3000 for local
            console.log('[CardNews API] Fetching from:', `${baseUrl}/api/generate-card-image`);

            const imageResponse = await fetch(`${baseUrl}/api/generate-card-image?${params.toString()}`);
            if (!imageResponse.ok) {
                throw new Error(`Server-side generation failed: ${imageResponse.status}`);
            }
            const ab = await imageResponse.arrayBuffer();
            imageBuffer = Buffer.from(ab);
        }

        console.log(`[CardNews API] Final Image Size: ${imageBuffer.length} bytes`);

        // 4. Publish to WordPress
        const result = await publishCardNewsToWordPress(imageBuffer, dateStr, {
            topNewsTitle: title,
            terminalUrl: 'https://chaovietnam.co.kr/daily-news-terminal/'
        });

        console.log('[CardNews API] Success:', result);

        return new Response(JSON.stringify({
            success: true,
            terminalUrl: result.terminalUrl,
            imageUrl: result.imageUrl
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[CardNews API] Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
