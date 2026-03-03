const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const news = await prisma.newsItem.findMany({
        where: { title: { contains: '전면 금지' } },
        select: {
            id: true,
            title: true,
            wordpressUrl: true,
            publishedAt: true
        }
    });

    fs.writeFileSync('urls_cigar.txt', JSON.stringify(news, null, 2));
    console.log('URLs written to urls_cigar.txt');
}

main().catch(console.error).finally(() => prisma.$disconnect());
