/**
 * Firebase Admin SDK 초기화 (싱글톤 패턴)
 * Firebase Storage 이미지 업로드 + Firestore 읽기에 사용
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

let storageInstance = null;
let firestoreInstance = null;

function getFirebaseAdmin() {
    if (getApps().length === 0) {
        // 서비스 계정 JSON이 환경변수에 있으면 사용, 없으면 기본 자격증명
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            initializeApp({
                credential: cert(serviceAccount),
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'chaovietnam-login.appspot.com',
            });
        } else {
            // Application Default Credentials (로컬 개발: gcloud auth 또는 GOOGLE_APPLICATION_CREDENTIALS)
            initializeApp({
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'chaovietnam-login.appspot.com',
            });
        }
    }
    return getApps()[0];
}

export function getFirebaseStorage() {
    if (!storageInstance) {
        getFirebaseAdmin();
        storageInstance = getStorage();
    }
    return storageInstance;
}

export function getFirestore() {
    if (!firestoreInstance) {
        getFirebaseAdmin();
        firestoreInstance = getAdminFirestore();
    }
    return firestoreInstance;
}
