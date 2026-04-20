const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const logs = await prisma.crawlerLog.findMany({
        where: {
            runAt: {
                gte: new Date('2026-04-17T22:30:00.000Z'),
                lte: new Date('2026-04-17T23:30:00.000Z')
            }
        },
        orderBy: { runAt: 'asc' }
    });
    console.log(JSON.stringify(logs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
