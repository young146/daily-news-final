import { getFirebaseStorage } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || typeof file === 'string') {
            return Response.json({ success: false, error: '파일이 없습니다.' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
        const filename = `push-images/${Date.now()}.${ext}`;

        const storage = getFirebaseStorage();
        const bucket = storage.bucket();
        const fileRef = bucket.file(filename);

        await fileRef.save(buffer, {
            metadata: { contentType: file.type || 'image/jpeg' },
            public: true,
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        return Response.json({ success: true, url: publicUrl });
    } catch (e) {
        console.error('이미지 업로드 실패:', e);
        return Response.json({ success: false, error: e.message }, { status: 500 });
    }
}
