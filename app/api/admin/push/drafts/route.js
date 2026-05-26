export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_KEY = 'xinchao_2026_dailydigest';
const CLOUD_BASE = 'https://asia-northeast3-chaovietnam-login.cloudfunctions.net';
const ADMIN_READ_URL = `${CLOUD_BASE}/adminRead`;
const ADMIN_WRITE_URL = `${CLOUD_BASE}/adminWrite`;

/** GET /api/admin/push/drafts — draft + scheduled 목록 */
export async function GET() {
    try {
        const res = await fetch(`${ADMIN_READ_URL}?key=${ADMIN_KEY}&collection=pushDrafts`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'adminRead 실패');
        return Response.json(data);
    } catch (e) {
        console.error('pushDrafts 조회 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}

/** POST /api/admin/push/drafts — 임시저장 또는 예약 등록 */
export async function POST(request) {
    try {
        const { title, body, url, imageUrl, scheduledAt } = await request.json();
        if (!title?.trim() || !body?.trim()) {
            return Response.json({ success: false, error: '제목과 내용을 모두 입력하세요.' }, { status: 400 });
        }

        const res = await fetch(ADMIN_WRITE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
            body: JSON.stringify({
                action: 'add',
                collection: 'pushDrafts',
                data: {
                    title: title.trim(),
                    body: body.trim(),
                    url: url?.trim() || null,
                    imageUrl: imageUrl?.trim() || null,
                    status: scheduledAt ? 'scheduled' : 'draft',
                    scheduledAt: scheduledAt || null,
                },
            }),
        });

        const data = await res.json();
        if (!res.ok) return Response.json({ success: false, error: data.error || '저장 실패' }, { status: res.status });
        return Response.json({ success: true, id: data.id, status: scheduledAt ? 'scheduled' : 'draft' });
    } catch (e) {
        console.error('pushDrafts 저장 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
