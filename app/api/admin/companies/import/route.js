export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getWpConfig() {
    const url = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
    const user = process.env.WORDPRESS_USERNAME;
    const pass = process.env.WORDPRESS_APP_PASSWORD;

    if (!user || !pass) return null;

    const base = `${url}/wp-json`;
    const token = Buffer.from(`${user}:${pass}`).toString('base64');
    return { base, token };
}

function missingEnvResponse() {
    return Response.json(
        {
            error: 'WP API 환경변수가 설정되지 않았습니다.',
            detail: 'WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD 를 .env.local 또는 Vercel 대시보드에 추가해주세요.',
        },
        { status: 503 }
    );
}

// POST /api/admin/companies/import — CSV 일괄 업로드 (multipart/form-data)
export async function POST(request) {
    const cfg = getWpConfig();
    if (!cfg) return missingEnvResponse();

    try {
        const formData = await request.formData();

        // Forward the multipart form directly to WP API
        const res = await fetch(`${cfg.base}/xcd/v1/import`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${cfg.token}`,
                // Do NOT set Content-Type — fetch will set it with the correct boundary for FormData
            },
            body: formData,
        });
        const data = await res.json().catch(() => ({}));
        return Response.json(data, { status: res.status });
    } catch (e) {
        console.error('[companies/import] POST 실패:', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
