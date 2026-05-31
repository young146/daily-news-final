import prisma from "@/lib/prisma";
import NewsCard from "@/components/NewsCard";
import AdBanner from "@/components/AdBanner";
import Image from "next/image";
import NewsImage from "@/components/NewsImage";
import { Calendar } from "lucide-react";

// Helper Component for List Items
function NewsItem({ news }) {
  const displayTitle = news.translatedTitle || news.title;
  const displaySummary = news.translatedSummary || news.summary;
  const linkUrl = news.wordpressUrl || '#';

  return (
    <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-3 group cursor-pointer bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="w-full h-56 md:h-64 relative flex-shrink-0">
        <NewsImage
          src={news.imageUrl}
          alt={displayTitle}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <div className="flex-grow p-4">
        <div className="flex items-center text-[10px] md:text-xs text-gray-500 mb-2 space-x-2">
          <span className="text-accent font-semibold">{news.category}</span>
          <span className="hidden md:inline">•</span>
          <span className="hidden md:inline">{new Date(news.publishedAt || news.createdAt).toLocaleDateString()}</span>
        </div>
        <h3 className="text-sm md:text-lg font-bold text-gray-900 mb-2 group-hover:text-accent transition-colors line-clamp-2">
          {displayTitle}
        </h3>
        <p className="text-gray-600 text-xs md:text-sm line-clamp-2">
          {displaySummary}
        </p>
      </div>
    </a>
  );
}

export default async function Home() {
  // Fetch news from DB (Only published ones for the public site)
  const newsItems = await prisma.newsItem.findMany({
    where: { isPublishedDaily: true },
    orderBy: [
      { isTopNews: 'desc' },
      { publishedAt: 'desc' }
    ],
    take: 20
  });

  // Fallback if no data (optional, or just show empty)
  const displayNews = newsItems.length > 0 ? newsItems : [];

  return (
    <div className="bg-slate-50 min-h-screen pb-12">
      {/* Hero Section */}
      <section className="relative bg-slate-900 py-20 md:py-32 overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0 opacity-60">
          <Image
            src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=2000&q=80"
            alt="Background"
            fill
            className="object-cover"
            priority
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent z-0" />

        <div className="container mx-auto px-4 text-center relative z-10">
          <span className="inline-block py-1 px-4 rounded-full bg-accent text-white text-sm font-bold mb-6 shadow-lg">
            오늘의 뉴스 • {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white mb-2 tracking-tight drop-shadow-md">
            [씬짜오 오늘의 뉴스]
          </h1>
          <p className="text-xl md:text-2xl text-slate-100 font-serif mb-6 drop-shadow-sm">
            XinChao Today's News
          </p>
          <p className="text-lg md:text-xl text-white max-w-2xl mx-auto leading-relaxed font-light drop-shadow-md">
            매일 아침, 베트남과 한국의 가장 중요한 소식을 전해드립니다.<br />
            사회, 경제, 문화 정책 등 꼭 필요한 정보만 엄선했습니다.
          </p>
        </div>
      </section>

      {/* Top News Grid - Limit to 2 items */}
      <section className="container mx-auto px-4 py-12">
        <h2 className="sr-only">Top News</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {displayNews.slice(0, 2).map((news) => (
            <NewsCard key={news.id} news={news} />
          ))}
        </div>
      </section>

      {/* Main Content Area: Categories & Ads */}
      <section className="container mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left Column: News Categories */}
          <div className="lg:col-span-2 space-y-16">

            {/* Ad after Top News */}
            <AdBanner />

            {/* Category: Society */}
            <section>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6 flex items-center border-b border-gray-200 pb-2">
                <span className="text-accent mr-2">#</span> 사회 (Society)
              </h2>
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                {displayNews.slice(2).filter(n => n.category === 'Society').slice(0, 4).map((news, i) => (
                  <NewsItem key={`soc-${i}`} news={news} />
                ))}
              </div>
            </section>

            <AdBanner />

            {/* Category: Economy */}
            <section>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6 flex items-center border-b border-gray-200 pb-2">
                <span className="text-accent mr-2">#</span> 경제 (Economy)
              </h2>
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                {displayNews.slice(2).filter(n => n.category === 'Economy').slice(0, 4).map((news, i) => (
                  <NewsItem key={`eco-${i}`} news={news} />
                ))}
              </div>
            </section>

            <AdBanner />

            {/* Category: Culture */}
            <section>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6 flex items-center border-b border-gray-200 pb-2">
                <span className="text-accent mr-2">#</span> 문화 (Culture)
              </h2>
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                {displayNews.slice(2).filter(n => n.category === 'Culture').slice(0, 4).map((news, i) => (
                  <NewsItem key={`cul-${i}`} news={news} />
                ))}
              </div>
            </section>

            <AdBanner />

            {/* Category: Policy */}
            <section>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6 flex items-center border-b border-gray-200 pb-2">
                <span className="text-accent mr-2">#</span> 정책 (Policy)
              </h2>
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                {displayNews.slice(2).filter(n => n.category === 'Policy').slice(0, 4).map((news, i) => (
                  <NewsItem key={`pol-${i}`} news={news} />
                ))}
              </div>
            </section>

            <AdBanner />

            <AdBanner />

            {/* Category: Korea-Vietnam */}
            <section>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6 flex items-center border-b border-gray-200 pb-2">
                <span className="text-accent mr-2">#</span> 한-베 (Korea-Vietnam)
              </h2>
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                {displayNews.slice(2).filter(n => n.category === 'Korea-Vietnam').slice(0, 4).map((news, i) => (
                  <NewsItem key={`kv-${i}`} news={news} />
                ))}
              </div>
            </section>

            {/* Past News Button */}
            <div className="text-center pt-8">
              <button className="inline-flex items-center justify-center px-8 py-3 border border-gray-300 shadow-sm text-sm font-medium rounded-full text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-all">
                <Calendar size={16} className="mr-2 text-gray-400" />
                지난 뉴스 보기 (Archive)
              </button>
            </div>
          </div>

          {/* Sidebar / Trending */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm sticky top-24">
              <h3 className="text-lg font-bold text-gray-900 mb-4">인기 키워드</h3>
              <div className="flex flex-wrap gap-2 mb-8">
                {['경제성장', '지하철', 'K-Pop', '관광', '비자', '삼성전자'].map(tag => (
                  <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full hover:bg-accent hover:text-white transition-colors cursor-pointer">
                    #{tag}
                  </span>
                ))}
              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-4">많이 본 뉴스</h3>
              <ul className="space-y-4">
                {displayNews.slice(0, 3).map((news, i) => (
                  <li key={i} className="flex gap-3 group">
                    <span className="text-2xl font-bold text-gray-200 group-hover:text-accent transition-colors">{i + 1}</span>
                    <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900 line-clamp-2 cursor-pointer">
                      {news.title}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


