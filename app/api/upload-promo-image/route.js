// app/api/upload-promo-image/route.js
// Firebase Storage에 이미지를 업로드하고 공개 URL을 반환합니다.

import { NextResponse } from 'next/server';
import { getFirebaseStorage } from '@/lib/firebase-admin';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const mimeType = file.type || 'image/jpeg';
        const ext = mimeType.split('/')[1] || 'jpg';
        const fileName = `promo-cards/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const storage = getFirebaseStorage();
        const bucket = storage.bucket();
        const fileRef = bucket.file(fileName);

        await fileRef.save(buffer, {
            metadata: { contentType: mimeType },
        });

        // 공개 URL 생성 (Firebase Storage 공개 다운로드 URL)
        await fileRef.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        return NextResponse.json({ success: true, imageUrl: publicUrl });
    } catch (error) {
        console.error('[UploadPromoImage] 오류:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
