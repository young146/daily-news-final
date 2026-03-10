import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env'), override: false });

const prisma = new PrismaClient();

async function main() {
    const del = await prisma.subscriber.deleteMany({ where: { isActive: false } });
    console.log(`✅ 삭제 완료: ${del.count}명`);
    const remaining = await prisma.subscriber.count();
    console.log(`📊 남은 구독자: ${remaining}명`);
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
