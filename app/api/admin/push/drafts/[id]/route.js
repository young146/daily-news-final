import { getFirestore } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PUT /api/admin/push/drafts/[id] — 임시저장 수정 */
export async function PUT(request, { params }) {
    try {
        const { title, body, url, imageUrl, scheduledAt } = await request.json();

        if (!title?.trim() || !body?.trim()) {
            return Response.json({ success: false, error: '제목과 내용을 모두 입력하세요.' }, { status: 400 });
        }

        const db = getFirestore();
        const update = {
            title: title.trim(),
            body: body.trim(),
            url: url?.trim() || null,
            imageUrl: imageUrl?.trim() || null,
            status: scheduledAt ? 'scheduled' : 'draft',
            scheduledAt: scheduledAt ? Timestamp.fromDate(new Date(scheduledAt)) : null,
            updatedAt: FieldValue.serverTimestamp(),
        };

        await db.collection('pushDrafts').doc(params.id).update(update);
        return Response.json({ success: true });
    } catch (e) {
        console.error('pushDrafts 수정 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}

/** DELETE /api/admin/push/drafts/[id] — 임시저장 삭제 */
export async function DELETE(request, { params }) {
    try {
        const db = getFirestore();
        await db.collection('pushDrafts').doc(params.id).delete();
        return Response.json({ success: true });
    } catch (e) {
        console.error('pushDrafts 삭제 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
