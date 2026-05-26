export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_KEY = 'xinchao_2026_dailydigest';
const CLOUD_BASE = 'https://asia-northeast3-chaovietnam-login.cloudfunctions.net';
const CLOUD_FN_URL = `${CLOUD_BASE}/sendCustomPush`;
const ADMIN_READ_URL = `${CLOUD_BASE}/adminRead`;

/** GET /api/admin/push — broadcastLogs + 댓글 수 병합 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const announcementId = searchParams.get('announcementId');

    try {
        const params = new URLSearchParams({ key: ADMIN_KEY });
        if (announcementId) {
            params.set('collection', 'announcements');
            params.set('announcementId', announcementId);
        } else {
            params.set('collection', 'broadcastLogs');
        }

        const res = await fetch(`${ADMIN_READ_URL}?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'adminRead 실패');

        return Response.json(data);
    } catch (e) {
        console.error('push logs 조회 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}

/** POST /api/admin/push — 커스텀 푸시 발송 */
export async function POST(request) {
    try {
        const { title, body, url, imageUrl, dryRun } = await request.json();

        if (!title?.trim() || !body?.trim()) {
            return Response.json({ success: false, error: '제목과 내용을 모두 입력하세요.' }, { status: 400 });
        }

        const res = await fetch(CLOUD_FN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
            body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url || null, imageUrl: imageUrl || null, dryRun: !!dryRun }),
        });

        const data = await res.json();
        if (!res.ok) return Response.json({ success: false, error: data.error || '발송 실패' }, { status: res.status });
        return Response.json(data);
    } catch (e) {
        console.error('커스텀 푸시 발송 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
