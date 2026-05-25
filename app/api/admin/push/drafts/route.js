import { getFirestore } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/push/drafts — draft + scheduled 목록 */
export async function GET() {
    try {
        const db = getFirestore();
        const snap = await db.collection('pushDrafts')
            .where('status', 'in', ['draft', 'scheduled'])
            .orderBy('createdAt', 'desc')
            .get();

        const drafts = snap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                title: d.title || '',
                body: d.body || '',
                url: d.url || null,
                imageUrl: d.imageUrl || null,
                status: d.status || 'draft',
                scheduledAt: d.scheduledAt?.toDate?.()?.toISOString() || null,
                createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
            };
        });

        return Response.json({ success: true, drafts });
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

        const db = getFirestore();
        const data = {
            title: title.trim(),
            body: body.trim(),
            url: url?.trim() || null,
            imageUrl: imageUrl?.trim() || null,
            status: scheduledAt ? 'scheduled' : 'draft',
            scheduledAt: scheduledAt ? Timestamp.fromDate(new Date(scheduledAt)) : null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('pushDrafts').add(data);
        return Response.json({ success: true, id: docRef.id, status: data.status });
    } catch (e) {
        console.error('pushDrafts 저장 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
