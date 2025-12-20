import { PrismaClient } from '@prisma/client';
import TranslationForm from './translation-form';

const prisma = new PrismaClient();

async function getNewsItem(id) {
    return await prisma.newsItem.findUnique({
        where: { id },
    });
}

export default async function TranslatePage({ params }) {
    const { id } = await params;
    const newsItem = await getNewsItem(id);

    if (!newsItem) {
        return <div>News item not found</div>;
    }

    // Fetch all top news to determine the next UNREVIEWED item
    const topNews = await prisma.newsItem.findMany({
        where: { isSelected: true },
        orderBy: { createdAt: 'desc' }, // Match the admin page order
        select: { id: true, translationStatus: true }
    });

    // Find the next item that needs review (not COMPLETED and not SKIPPED)
    // We look for the first item in the list that meets the criteria and is NOT the current one.
    // This ensures we always jump to a pending item.
    const nextItem = topNews.find(item =>
        item.id !== id &&
        item.translationStatus !== 'COMPLETED' &&
        item.translationStatus !== 'SKIPPED'
    );

    const nextId = nextItem ? nextItem.id : null;

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Translate & Edit</h1>
                <div className="flex gap-4">
                    {nextId && (
                        <a href={`/admin/news/${nextId}/translate`} className="text-blue-600 hover:underline font-medium">
                            Next Item →
                        </a>
                    )}
                    <a href="/admin" className="text-gray-500 hover:underline">← Back to Dashboard</a>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
                {/* Left: Original Content */}
                <div className="space-y-6">
                    <div className="bg-gray-50 p-4 rounded border">
                        <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Original Title</h3>
                        <p className="font-medium text-lg">{newsItem.title}</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded border">
                        <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Original Summary</h3>
                        <p className="text-gray-700">{newsItem.summary}</p>
                    </div>

                    <div className="bg-gray-50 p-4 rounded border">
                        <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Original Content (Preview)</h3>
                        <div className="prose max-w-none text-sm text-gray-600 max-h-[500px] overflow-y-auto">
                            {/* Simple text preview for now, assuming content might be HTML or text */}
                            {newsItem.content || "No content available."}
                        </div>
                        <div className="mt-2">
                            <a href={newsItem.originalUrl} target="_blank" className="text-blue-600 hover:underline text-sm">View Original Source →</a>
                        </div>
                    </div>
                </div>

                {/* Right: Translation Form (Client Component) */}
                <TranslationForm newsItem={newsItem} nextId={nextId} />
            </div>
        </div>
    );
}
