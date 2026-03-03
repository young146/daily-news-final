const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const news = await prisma.newsItem.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        take: 10,
        select: {
            id: true,
            title: true,
            wordpressUrl: true,
            publishedAt: true
        }
    });

    const lines = news.map(n => `${n.wordpressUrl} | ${n.title}`);
    fs.writeFileSync('urls.txt', lines.join('\n'));
    console.log('URLs written to urls.txt');
}

main().catch(console.error).finally(() => prisma.$disconnect());
