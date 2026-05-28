export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getWpConfig() {
    const url = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
    const user = process.env.WORDPRESS_USERNAME;
    const pass = process.env.WORDPRESS_APP_PASSWORD;

    if (!user || !pass) {
        return null;
    }

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

// GET /api/admin/companies — 목록 조회 (검색/필터/정렬/페이지네이션)
export async function GET(request) {
    const cfg = getWpConfig();
    if (!cfg) return missingEnvResponse();

    const { searchParams } = new URL(request.url);
    const params = new URLSearchParams();

    const allowed = ['q', 'area', 'group', 'orderby', 'order', 'page', 'per_page'];
    for (const key of allowed) {
        const val = searchParams.get(key);
        if (val) params.set(key, val);
    }
    if (!params.has('per_page')) params.set('per_page', '25');

    try {
        const res = await fetch(`${cfg.base}/xcd/v1/search?${params}`, {
            headers: { Authorization: `Basic ${cfg.token}` },
            cache: 'no-store',
        });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch (e) {
        console.error('[companies] GET 실패:', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}

// POST /api/admin/companies — 신규 등록
export async function POST(request) {
    const cfg = getWpConfig();
    if (!cfg) return missingEnvResponse();

    try {
        const body = await request.json();
        const res = await fetch(`${cfg.base}/xcd/v1/create`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${cfg.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch (e) {
        console.error('[companies] POST 실패:', e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
