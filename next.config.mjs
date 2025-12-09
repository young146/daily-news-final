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
    ],
  },
  allowedDevOrigins: ['*'],
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
};

export default nextConfig;
