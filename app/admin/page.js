import { PrismaClient } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { translateText, translateNewsItem } from '@/lib/openai';
import CategorySelector from './category-selector';
import GenerateButton from './generate-button';
import { BatchTranslateButton, BatchPublishButton, CardNewsToggle, WorkflowButton, BatchTranslateTitlesButton } from './batch-actions';
import CrawlNewsButton from './crawl-news-button';

const prisma = new PrismaClient();

async function getNews() {
    const allNews = await prisma.newsItem.findMany({
        orderBy: { createdAt: 'desc' },
        where: {
            status: {
                notIn: ['PUBLISHED', 'ARCHIVED']
            }
        }
    });

    const selectionPark = allNews.filter(item => !item.isSelected);
    const topNews = allNews.filter(item => item.isSelected);

    return { selectionPark, topNews };
}

async function addToTop(formData) {
    'use server';
    const id = formData.get('id');
    await prisma.newsItem.update({
        where: { id },
        data: { isSelected: true }
    });
    revalidatePath('/admin');
}

async function removeFromTop(formData) {
    'use server';
    const id = formData.get('id');
    await prisma.newsItem.update({
        where: { id },
        data: { isSelected: false, isTopNews: false }
    });
    revalidatePath('/admin');
}

async function toggleTopNews(formData) {
    'use server';
    const id = formData.get('id');

    const item = await prisma.newsItem.findUnique({ where: { id } });
    if (item.isTopNews) {
        await prisma.newsItem.update({ where: { id }, data: { isTopNews: false } });
    } else {
        const count = await prisma.newsItem.count({
            where: {
                isTopNews: true,
                status: { notIn: ['PUBLISHED', 'ARCHIVED'] }
            }
        });
        if (count < 2) {
            await prisma.newsItem.update({ where: { id }, data: { isTopNews: true } });
        }
    }
    revalidatePath('/admin');
}

async function deleteNewsItem(formData) {
    'use server';
    const id = formData.get('id');
    await prisma.newsItem.delete({ where: { id } });
    revalidatePath('/admin');
}

export default async function AdminPage() {
    const { selectionPark, topNews } = await getNews();

    const topCount = topNews.filter(n => n.isTopNews).length;
    const socCount = topNews.filter(n => n.category === 'Society' && !n.isTopNews).length;
    const ecoCount = topNews.filter(n => n.category === 'Economy' && !n.isTopNews).length;
    const culCount = topNews.filter(n => n.category === 'Culture' && !n.isTopNews).length;
    const polCount = topNews.filter(n => n.category === 'Policy' && !n.isTopNews).length;
    const kvCount = topNews.filter(n => n.category === 'Korea-Vietnam' && !n.isTopNews).length;
    const cardNewsCount = topNews.filter(n => n.isCardNews).length;

    const Counter = ({ label, count, target, href }) => {
        const content = (
            <div className={`px-2 py-1.5 rounded-md border flex flex-col items-center justify-center min-w-[100px] ${count < target ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-0.5">{label}</div>
                <div className="text-lg font-bold leading-none">{count} <span className="text-xs font-normal text-gray-400">/ {target}</span></div>
            </div>
        );

        return href ? <Link href={href}>{content}</Link> : content;
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <div className="flex gap-2">
                    <CrawlNewsButton />
                    <a href="/api/generate-card-image" target="_blank" className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 transition flex items-center gap-2">
                        🖼️ 오늘의 카드 이미지
                    </a>
                    <Link href="/admin/card-news" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition flex items-center gap-2">
                        📮 전령카드 확인하기
                    </Link>
                    <Link href="/admin/settings" className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 transition flex items-center gap-2">
                        ⚙️ 설정
                    </Link>
                </div>
            </div>

            {/* Status Dashboard (Sticky) */}
            <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm py-3 mb-6 -mx-6 px-6 border-b border-gray-200">
                <div className="flex justify-between gap-2 overflow-x-auto">
                    <Counter label="Top News" count={topCount} target={2} />
                    <Counter label="Society" count={socCount} target={4} />
                    <Counter label="Economy" count={ecoCount} target={4} />
                    <Counter label="Culture" count={culCount} target={4} />
                    <Counter label="Policy" count={polCount} target={4} />
                    <Counter label="Korea-Vietnam" count={kvCount} target={4} />
                    <Counter label="Card News" count={cardNewsCount} target={4} href="/admin/card-news" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Left Column: Selection Park */}
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold text-gray-700">Collected News</h2>
                        {selectionPark.length > 0 && (
                            <BatchTranslateTitlesButton ids={selectionPark.filter(n => !n.translatedTitle).map(n => n.id)} />
                        )}
                    </div>
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="font-semibold">Total Items</span>
                            <span className="text-sm font-normal bg-gray-200 px-2 py-1 rounded">{selectionPark.length} items</span>
                        </div>
                        <div className="space-y-4 h-[80vh] overflow-y-auto pr-2">
                            {selectionPark.map(item => (
                                <div key={item.id} className="bg-white p-4 rounded shadow-sm border border-gray-200">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold text-blue-600 uppercase">{item.source}</span>
                                        <span className="text-xs text-gray-500">{new Date(item.publishedAt).toLocaleDateString()}</span>
                                    </div>
                                    <h3 className="font-medium text-gray-900 mb-2">
                                        <Link href={`/admin/news/${item.id}/translate`} className="hover:text-blue-600 hover:underline">
                                            {item.translatedTitle || item.title}
                                        </Link>
                                        {item.translatedTitle && <span className="block text-xs text-gray-500 font-normal mt-1">{item.title}</span>}
                                    </h3>
                                    <div className="flex justify-between items-center mt-2">
                                        <div className="w-40">
                                            <CategorySelector id={item.id} initialCategory={item.category} />
                                        </div>
                                        <div className="flex gap-2">
                                            <form action={deleteNewsItem}>
                                                <input type="hidden" name="id" value={item.id} />
                                                <button type="submit" className="text-sm bg-gray-200 text-gray-600 px-2 py-1 rounded hover:bg-red-100 hover:text-red-600 transition" title="Delete">
                                                    🗑️
                                                </button>
                                            </form>
                                            <form action={addToTop}>
                                                <input type="hidden" name="id" value={item.id} />
                                                <button type="submit" className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition">
                                                    Select →
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {selectionPark.length === 0 && (
                                <p className="text-center text-gray-500 py-8">No new items found. Run crawler to fetch news.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Top News */}
                <div className="border rounded-lg p-4 bg-white shadow-sm">
                    <h2 className="text-xl font-semibold mb-4 flex justify-between items-center text-blue-800">
                        <div className="flex items-center gap-2">
                            Top News (Selected)
                            <span className="text-sm font-normal bg-blue-100 text-blue-800 px-2 py-1 rounded">{topNews.length} items</span>
                        </div>
                        <div className="flex gap-2">
                            <WorkflowButton topNews={topNews} />
                        </div>
                    </h2>
                    <div className="space-y-4 h-[80vh] overflow-y-auto pr-2">
                        {topNews.map(item => (
                            <div key={item.id} className={`p-4 rounded border ${item.isTopNews ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-blue-600 uppercase">{item.source}</span>
                                        {item.isTopNews && <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded font-bold">★ TOP NEWS</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded ${item.translationStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                            item.translationStatus === 'DRAFT' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-gray-200 text-gray-600'
                                            }`}>
                                            {item.translationStatus}
                                        </span>
                                    </div>
                                </div>

                                <h3 className="font-medium text-gray-900 mb-2">
                                    <Link href={`/admin/news/${item.id}/translate`} className="hover:text-blue-600 hover:underline flex items-center gap-2 group">
                                        {item.translatedTitle || item.title}
                                        <span className="opacity-0 group-hover:opacity-100 text-xs text-blue-500">✎ Edit</span>
                                    </Link>
                                </h3>

                                <div className="mb-3">
                                    <CategorySelector id={item.id} initialCategory={item.category} />
                                </div>

                                <div className="flex justify-between items-center mt-4 pt-3 border-t border-blue-100/50">
                                    <div className="flex gap-2 items-center">
                                        <CardNewsToggle id={item.id} isCardNews={item.isCardNews} />
                                        <form action={removeFromTop}>
                                            <input type="hidden" name="id" value={item.id} />
                                            <button type="submit" className="text-xs text-red-600 hover:text-red-800 hover:underline">
                                                ← Unselect
                                            </button>
                                        </form>
                                        <form action={toggleTopNews}>
                                            <input type="hidden" name="id" value={item.id} />
                                            <button type="submit" className={`text-xs flex items-center gap-1 ${item.isTopNews ? 'text-yellow-600 font-bold' : 'text-gray-400 hover:text-yellow-500'}`}>
                                                {item.isTopNews ? '★ Unset Top' : '☆ Set as Top'}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {topNews.length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                            <p className="text-gray-500">Select news from the left column to start curation.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
