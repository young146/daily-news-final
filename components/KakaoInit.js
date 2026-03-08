'use client';

import Script from 'next/script';

export default function KakaoInit() {
    return (
        <Script
            src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
            strategy="afterInteractive"
            onLoad={() => {
                if (window.Kakao && !window.Kakao.isInitialized()) {
                    window.Kakao.init('38d98e0ea6c259f84a62d286fa318287');
                    console.log('[Kakao] SDK initialized');
                }
            }}
        />
    );
}
