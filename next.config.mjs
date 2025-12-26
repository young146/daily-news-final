/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      { protocol: 'https', hostname: '**.vnecdn.net' },
      { protocol: 'https', hostname: 'img.yonhapnews.co.kr' },
      { protocol: 'https', hostname: 'img6.yna.co.kr' },
      { protocol: 'https', hostname: 'img1.yna.co.kr' },
      { protocol: 'https', hostname: 'img2.yna.co.kr' },
      { protocol: 'https', hostname: 'img3.yna.co.kr' },
      { protocol: 'https', hostname: 'img4.yna.co.kr' },
      { protocol: 'https', hostname: 'img5.yna.co.kr' },
      { protocol: 'https', hostname: 'img7.yna.co.kr' },
      { protocol: 'https', hostname: 'img8.yna.co.kr' },
      { protocol: 'https', hostname: 'img9.yna.co.kr' },
      { protocol: 'http', hostname: 'www.insidevina.com' },
      { protocol: 'https', hostname: 'cdn2.tuoitre.vn' },
      { protocol: 'https', hostname: 'cdn.tuoitre.vn' },
      { protocol: 'https', hostname: 'image.thanhnien.vn' },
      { protocol: 'https', hostname: 'cdn.vnanet.vn' },
      { protocol: 'https', hostname: 'vnanet.vn' },
      { protocol: 'https', hostname: 'via.placeholder.com' },
      { protocol: 'https', hostname: 'cdn.insidevina.com' },
      { protocol: 'https', hostname: 'images2.thanhnien.vn' },
      { protocol: 'https', hostname: 'media.urbanistnetwork.com' },
      { protocol: 'https', hostname: 'soranews24.com' },
      { protocol: 'https', hostname: 'en.cand.com.vn' },
    ],
  },
  allowedDevOrigins: [
    '88754070-3672-489f-b64d-b73a3ce2cc1e-00-1bejzjdbyvje0.picard.replit.dev',
    '127.0.0.1',
    'localhost',
  ],
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  // ✅ Next.js 16에서는 serverExternalPackages로 루트 레벨에 설정
  serverExternalPackages: ['canvas'],
};

export default nextConfig;
