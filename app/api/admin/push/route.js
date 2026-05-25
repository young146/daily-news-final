import { getFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD_FN_URL = 'https://asia-northeast3-chaovietnam-login.cloudfunctions.net/sendCustomPush';
const ADMIN_KEY = 'xinchao_2026_dailydigest';

/** GET /api/admin/push — broadcastLogs + announcements 병합 조회
 *  ?announcementId=xxx → 해당 공지의 댓글 목록 반환 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const announcementId = searchParams.get('announcementId');

    try {
        const db = getFirestore();

        // 공지별 댓글 조회
        if (announcementId) {
            const snap = await db
                .collection('announcements').doc(announcementId)
                .collection('comments')
                .orderBy('createdAt', 'asc')
                .get();

            const comments = snap.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    userId: d.userId || '',
                    displayName: d.displayName || '익명',
                    text: d.text || '',
                    imageUrl: d.imageUrl || null,
                    parentId: d.parentId || null,
                    parentDisplayName: d.parentDisplayName || null,
                    createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
                };
            });
            return Response.json({ success: true, comments });
        }

        // 전체 이력 조회: broadcastLogs + announcements 댓글 수 병합
        const [logsSnap, announcementsSnap] = await Promise.all([
            db.collection('broadcastLogs').orderBy('sentAt', 'desc').limit(50).get(),
            db.collection('announcements').orderBy('sentAt', 'desc').limit(50).get(),
        ]);

        // announcementId → commentCount 맵
        const commentCountMap = {};
        announcementsSnap.docs.forEach(doc => {
            commentCountMap[doc.id] = doc.data().commentCount || 0;
        });

        const logs = logsSnap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                type: d.type || '',
                title: d.title || '',
                body: d.body || '',
                imageUrl: d.imageUrl || null,
                url: d.url || null,
                fcmCount: d.fcmCount ?? 0,
                expoCount: d.expoCount ?? 0,
                status: d.status || 'sent',
                sentAt: d.sentAt?.toDate?.()?.toISOString() || null,
                campaign: d.campaign || '',
                announcementId: d.announcementId || null,
                commentCount: d.announcementId ? (commentCountMap[d.announcementId] ?? 0) : null,
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
