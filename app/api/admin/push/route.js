import { getFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD_FN_URL = 'https://asia-northeast3-chaovietnam-login.cloudfunctions.net/sendCustomPush';
const ADMIN_KEY = 'xinchao_2026_dailydigest';

/** GET /api/admin/push — broadcastLogs 이력 조회 */
export async function GET(request) {
    try {
        const db = getFirestore();
        const snap = await db.collection('broadcastLogs')
            .orderBy('sentAt', 'desc')
            .limit(50)
            .get();

        const logs = snap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                type: d.type || '',
                title: d.title || '',
                body: d.body || '',
                fcmCount: d.fcmCount ?? 0,
                expoCount: d.expoCount ?? 0,
                status: d.status || 'sent',
                sentAt: d.sentAt?.toDate?.()?.toISOString() || null,
                campaign: d.campaign || '',
            };
        });

        return Response.json({ success: true, logs });
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
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': ADMIN_KEY,
            },
            body: JSON.stringify({
                title: title.trim(),
                body: body.trim(),
                url: url || null,
                imageUrl: imageUrl || null,
                dryRun: !!dryRun,
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            return Response.json({ success: false, error: data.error || '발송 실패' }, { status: res.status });
        }

        return Response.json(data);
    } catch (e) {
        console.error('커스텀 푸시 발송 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
