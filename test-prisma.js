const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.newsItem.findMany({take: 1}).then(console.log).catch(console.error).finally(()=>prisma.$disconnect());
