
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');
    const filename = searchParams.get('filename') || 'image.jpg';
    const download = searchParams.get('download') === '1';

    if (!imageUrl) {
        return new Response('Missing URL parameter', { status: 400 });
    }

    try {
        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

        const blob = await response.blob();
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'no-store');
        if (download) {
            headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        }

        return new Response(blob, { status: 200, headers });
    } catch (error) {
        console.error('Proxy Error:', error);
        return new Response('Failed to fetch image', { status: 500 });
    }
}
