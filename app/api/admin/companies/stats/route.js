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

// GET /api/admin/companies/stats — 통계
export async function GET() {
    const cfg = getWpConfig();
    if (!cfg) return missingEnvResponse();

    try {
        const res = await fetch(`${cfg.base}/xcd/v1/companies/stats`, {
            headers: { Authorization: `Basic ${cfg.token}` },
            cache: 'no-store',
        });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch (e) {
        console.error('[companies/stats] GET 실패:', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
