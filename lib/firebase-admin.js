/**
 * Firebase Admin SDK 초기화 (싱글톤 패턴)
 * Firebase Storage 이미지 업로드 + Firestore 읽기에 사용
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

// ID 토큰 검증은 projectId 만 있으면 동작(서명검증은 구글 공개키 사용, 서비스계정 불필요)
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'chaovietnam-login';

let storageInstance = null;
let firestoreInstance = null;
let authInstance = null;

function getFirebaseAdmin() {
    if (getApps().length === 0) {
        // 서비스 계정 JSON이 환경변수에 있으면 사용, 없으면 기본 자격증명
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            initializeApp({
                credential: cert(serviceAccount),
                projectId: PROJECT_ID,
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'chaovietnam-login.appspot.com',
            });
        } else {
            // Application Default Credentials (로컬 개발: gcloud auth 또는 GOOGLE_APPLICATION_CREDENTIALS)
            initializeApp({
                projectId: PROJECT_ID,
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'chaovietnam-login.appspot.com',
            });
        }
    }
    return getApps()[0];
}

export function getFirebaseAuth() {
    if (!authInstance) {
        getFirebaseAdmin();
        authInstance = getAdminAuth();
    }
    return authInstance;
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
