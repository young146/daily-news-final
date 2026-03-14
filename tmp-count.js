const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.subscriber.count({ where: { isActive: true } });
  console.log('Final Count:', c);
}

main().catch(console.error).finally(() => prisma.$disconnect());
