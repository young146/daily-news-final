// lib/firebase-client.js
// Firebase 클라이언트 SDK 설정 (브라우저에서 직접 Storage 업로드용)

import { initializeApp, getApps } from 'firebase/app';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyAAtT9gcu8eVQIhQxYEgBTGp2XZ6ghz_NU",
    authDomain: "chaovietnam-login.firebaseapp.com",
    projectId: "chaovietnam-login",
    storageBucket: "chaovietnam-login.firebasestorage.app",
    messagingSenderId: "249390849714",
    appId: "1:249390849714:web:34c894772258dad5e973ab",
};

let app;
if (typeof window !== 'undefined') {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

export function getClientStorage() {
    if (!app) {
        app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    }
    return getStorage(app);
}
