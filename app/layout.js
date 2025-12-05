import { Geist, Geist_Mono, Noto_Sans_KR } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  preload: true,
});

export const metadata = {
  title: "XinchaoNewsLetter - Daily Vietnam & Korea News",
  description: "Aggregated daily news from Vietnam and Korea, focusing on society, economy, and culture.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable} ${notoSansKR.variable} antialiased min-h-screen flex flex-col`}>
        <div id="site-header"><Header /></div>
        <main className="flex-grow">
          {children}
        </main>
        <div id="site-footer"><Footer /></div>
      </body>
    </html>
  );
}
