import { PrismaClient } from '@prisma/client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

async function getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
        totalNews,
        todayNews,
        weekNews,
        monthNews,
        publishedToday,
        publishedWeek,
        publishedMonth,
        bySource,
        byCategory,
        recentCrawlerLogs
    ] = await Promise.all([
        prisma.newsItem.count(),
        prisma.newsItem.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.newsItem.count({ where: { createdAt: { gte: weekStart } } }),
        prisma.newsItem.count({ where: { createdAt: { gte: monthStart } } }),
        prisma.newsItem.count({ where: { status: 'PUBLISHED', publishedAt: { gte: todayStart } } }),
        prisma.newsItem.count({ where: { status: 'PUBLISHED', publishedAt: { gte: weekStart } } }),
        prisma.newsItem.count({ where: { status: 'PUBLISHED', publishedAt: { gte: monthStart } } }),
        prisma.newsItem.groupBy({
            by: ['source'],
            _count: { id: true },
            where: { createdAt: { gte: weekStart } }
        }),
        prisma.newsItem.groupBy({
            by: ['category'],
            _count: { id: true },
            where: { createdAt: { gte: weekStart } }
        }),
        prisma.crawlerLog.findMany({
            orderBy: { runAt: 'desc' },
            take: 10
        })
    ]);

    return {
        totalNews,
        todayNews,
        weekNews,
        monthNews,
        publishedToday,
        publishedWeek,
        publishedMonth,
        bySource: bySource.sort((a, b) => b._count.id - a._count.id),
        byCategory: byCategory.sort((a, b) => b._count.id - a._count.id),
        recentCrawlerLogs
    };
}

export default async function StatsPage() {
    const stats = await getStats();

    const StatCard = ({ title, value, subtitle, color = 'blue' }) => (
        <div className={`bg-${color}-50 border border-${color}-200 rounded-lg p-4`}>
            <div className="text-sm text-gray-600">{title}</div>
            <div className={`text-3xl font-bold text-${color}-600`}>{value}</div>
            {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
        </div>
    );

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">통계 대시보드</h1>
                <Link href="/admin" className="text-blue-600 hover:underline">
                    ← 대시보드로 돌아가기
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600">오늘 수집</div>
                    <div className="text-3xl font-bold text-blue-600">{stats.todayNews}</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600">오늘 발행</div>
                    <div className="text-3xl font-bold text-green-600">{stats.publishedToday}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600">이번주 수집</div>
                    <div className="text-3xl font-bold text-purple-600">{stats.weekNews}</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="text-sm text-gray-600">이번주 발행</div>
                    <div className="text-3xl font-bold text-orange-600">{stats.publishedWeek}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white border rounded-lg p-4">
                    <h2 className="text-lg font-bold mb-4">소스별 수집 현황 (이번주)</h2>
                    <div className="space-y-2">
                        {stats.bySource.map((source) => (
                            <div key={source.source} className="flex justify-between items-center">
                                <span className="text-gray-700">{source.source || 'Unknown'}</span>
                                <div className="flex items-center gap-2">
                                    <div 
                                        className="bg-blue-500 h-4 rounded" 
                                        style={{ width: `${Math.min(source._count.id * 3, 150)}px` }}
                                    />
                                    <span className="text-sm font-medium w-8 text-right">{source._count.id}</span>
                                </div>
                            </div>
                        ))}
                        {stats.bySource.length === 0 && (
                            <p className="text-gray-500">데이터 없음</p>
                        )}
                    </div>
                </div>

                <div className="bg-white border rounded-lg p-4">
                    <h2 className="text-lg font-bold mb-4">카테고리별 현황 (이번주)</h2>
                    <div className="space-y-2">
                        {stats.byCategory.map((cat) => (
                            <div key={cat.category} className="flex justify-between items-center">
                                <span className="text-gray-700">{cat.category || 'Uncategorized'}</span>
                                <div className="flex items-center gap-2">
                                    <div 
                                        className="bg-green-500 h-4 rounded" 
                                        style={{ width: `${Math.min(cat._count.id * 3, 150)}px` }}
                                    />
                                    <span className="text-sm font-medium w-8 text-right">{cat._count.id}</span>
                                </div>
                            </div>
                        ))}
                        {stats.byCategory.length === 0 && (
                            <p className="text-gray-500">데이터 없음</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white border rounded-lg p-4 mb-8">
                <h2 className="text-lg font-bold mb-4">최근 크롤러 실행 기록</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-2 px-2">실행 시간</th>
                                <th className="text-left py-2 px-2">상태</th>
                                <th className="text-left py-2 px-2">수집 건수</th>
                                <th className="text-left py-2 px-2">메시지</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.recentCrawlerLogs.map((log) => (
                                <tr key={log.id} className="border-b hover:bg-gray-50">
                                    <td className="py-2 px-2">
                                        {new Date(log.runAt).toLocaleString('ko-KR')}
                                    </td>
                                    <td className="py-2 px-2">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            log.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                                            log.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td className="py-2 px-2 font-medium">{log.itemsFound}</td>
                                    <td className="py-2 px-2 text-gray-600 truncate max-w-xs">
                                        {log.message}
                                    </td>
                                </tr>
                            ))}
                            {stats.recentCrawlerLogs.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="py-4 text-center text-gray-500">
                                        크롤러 실행 기록이 없습니다
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-gray-50 border rounded-lg p-4">
                <h2 className="text-lg font-bold mb-2">전체 통계</h2>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-2xl font-bold text-gray-800">{stats.totalNews}</div>
                        <div className="text-sm text-gray-500">전체 뉴스</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-gray-800">{stats.monthNews}</div>
                        <div className="text-sm text-gray-500">이번달 수집</div>
                    </div>
                    <div>
                        <div className="text-2xl font-bold text-gray-800">{stats.publishedMonth}</div>
                        <div className="text-sm text-gray-500">이번달 발행</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
