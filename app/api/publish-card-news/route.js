import prisma from '@/lib/prisma';
import { publishCardNewsToWordPress, uploadImageToWordPress } from '@/lib/publisher';
import { getSeoulWeather, getExchangeRates } from '@/lib/external-data';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        console.log('[CardNews API] Received publish request...');

        // 1. Get Top News Info (for Title/Metadata)
        const topNews = await prisma.newsItem.findFirst({
            where: { isTopNews: true },
            orderBy: { publishedAt: 'desc' }
        });

        const title = topNews?.translatedTitle || topNews?.title || 'Daily News Card';
        const dateStr = new Date().toISOString().split('T')[0];

        let imageBuffer;

        // 2. Check if Client uploaded an image (Multipart Form Data)
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('multipart/form-data')) {
            console.log('[CardNews API] Handling multipart form data...');
            const formData = await request.formData();
            const file = formData.get('image');

            if (file) {
                console.log('[CardNews API] Client uploaded image found.');
                const arrayBuffer = await file.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
            }
        }

        // 3. Fallback: Generate Image Server-Side if not uploaded
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
