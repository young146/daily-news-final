import { getFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD_FN_URL = 'https://asia-northeast3-chaovietnam-login.cloudfunctions.net/sendCustomPush';
const ADMIN_KEY = 'xinchao_2026_dailydigest';

/** POST /api/admin/push/drafts/[id]/send — 임시저장 항목 즉시 발송 */
export async function POST(request, { params }) {
    try {
        const db = getFirestore();
        const draftDoc = await db.collection('pushDrafts').doc(params.id).get();

        if (!draftDoc.exists) {
            return Response.json({ success: false, error: '항목을 찾을 수 없습니다.' }, { status: 404 });
        }

        const d = draftDoc.data();
        if (d.status === 'sent' || d.status === 'sending') {
            return Response.json({ success: false, error: '이미 발송된 항목입니다.' }, { status: 400 });
        }

        const res = await fetch(CLOUD_FN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
            body: JSON.stringify({
                title: d.title,
                body: d.body,
                url: d.url || null,
                imageUrl: d.imageUrl || null,
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            return Response.json({ success: false, error: data.error || '발송 실패' }, { status: res.status });
        }

        await draftDoc.ref.update({
            status: 'sent',
            announcementId: data.announcementId || null,
            sentAt: FieldValue.serverTimestamp(),
        });

        return Response.json({ success: true, ...data });
    } catch (e) {
        console.error('draft 즉시 발송 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
