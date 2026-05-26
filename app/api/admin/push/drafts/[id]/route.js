export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_KEY = 'xinchao_2026_dailydigest';
const ADMIN_WRITE_URL = 'https://asia-northeast3-chaovietnam-login.cloudfunctions.net/adminWrite';

/** PUT /api/admin/push/drafts/[id] — 임시저장 수정 */
export async function PUT(request, { params }) {
    try {
        const { title, body, url, imageUrl, scheduledAt } = await request.json();
        if (!title?.trim() || !body?.trim()) {
            return Response.json({ success: false, error: '제목과 내용을 모두 입력하세요.' }, { status: 400 });
        }

        const res = await fetch(ADMIN_WRITE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
            body: JSON.stringify({
                action: 'update',
                collection: 'pushDrafts',
                docId: params.id,
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
        if (!res.ok) return Response.json({ success: false, error: data.error || '수정 실패' }, { status: res.status });
        return Response.json({ success: true });
    } catch (e) {
        console.error('pushDrafts 수정 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}

/** DELETE /api/admin/push/drafts/[id] — 임시저장 삭제 */
export async function DELETE(request, { params }) {
    try {
        const res = await fetch(ADMIN_WRITE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
            body: JSON.stringify({ action: 'delete', collection: 'pushDrafts', docId: params.id }),
        });

        const data = await res.json();
        if (!res.ok) return Response.json({ success: false, error: data.error || '삭제 실패' }, { status: res.status });
        return Response.json({ success: true });
    } catch (e) {
        console.error('pushDrafts 삭제 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
