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

// GET /api/admin/companies/[id] — 단건 조회
export async function GET(request, { params }) {
    const cfg = getWpConfig();
    if (!cfg) return missingEnvResponse();

    const { id } = await params;
    try {
        const res = await fetch(`${cfg.base}/xcd/v1/${id}`, {
            headers: { Authorization: `Basic ${cfg.token}` },
            cache: 'no-store',
        });
        const data = await res.json();
        return Response.json(data, { status: res.status });
    } catch (e) {
        console.error(`[companies/${id}] GET 실패:`, e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}

// POST /api/admin/companies/[id] — 수정
export async function POST(request, { params }) {
    const cfg = getWpConfig();
    if (!cfg) return missingEnvResponse();

    const { id } = await params;
    try {
        const body = await request.json();
        const res = await fetch(`${cfg.base}/xcd/v1/${id}`, {
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
        console.error(`[companies/${id}] POST 실패:`, e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}

// DELETE /api/admin/companies/[id] — 삭제
export async function DELETE(request, { params }) {
    const cfg = getWpConfig();
    if (!cfg) return missingEnvResponse();

    const { id } = await params;
    try {
        const res = await fetch(`${cfg.base}/xcd/v1/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Basic ${cfg.token}` },
        });
        const data = await res.json().catch(() => ({}));
        return Response.json(data, { status: res.status });
    } catch (e) {
        console.error(`[companies/${id}] DELETE 실패:`, e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
