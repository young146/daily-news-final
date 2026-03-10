/**
 * cleanup-bounces-csv.mjs
 * CSV에서 바운스 이메일을 파싱해서 DB에서 비활성화합니다.
 * 실행: node scripts/cleanup-bounces-csv.mjs
 */

import { PrismaClient } from '@prisma/client';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { config } from 'dotenv';

// 환경변수 로드
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env'), override: false });

const prisma = new PrismaClient();
const CSV_PATH = resolve(process.cwd(), 'emails-sent-1773112138243.csv');

async function main() {
    // CSV 파싱
    const bouncedSet = new Set();
    const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity });
    let firstLine = true;

    for await (const line of rl) {
        if (firstLine) { firstLine = false; continue; } // 헤더 스킵
        if (!line.trim()) continue;
        // CSV 컬럼: id,created_at,subject,from,to,cc,bcc,reply_to,last_event,...
        const cols = line.split(',');
        const email = cols[4]?.trim().toLowerCase().replace(/^"|"$/g, '');
        const status = cols[8]?.trim().toLowerCase();
        if (email && status === 'bounced') {
            bouncedSet.add(email);
        }
    }

    const bouncedEmails = [...bouncedSet];
    console.log(`\n📋 CSV에서 고유 바운스 이메일: ${bouncedEmails.length}개`);
    console.log('[미리보기 10개]', bouncedEmails.slice(0, 10));

    // DB에서 비활성화
    console.log('\n🗄️  DB 비활성화 중...');
    const result = await prisma.subscriber.updateMany({
        where: {
            email: { in: bouncedEmails },
            isActive: true,
        },
        data: { isActive: false },
    });

    console.log(`✅ 비활성화 완료: ${result.count}명`);

    const remaining = await prisma.subscriber.count({ where: { isActive: true } });
    const total = await prisma.subscriber.count();
    console.log(`\n📊 DB 현황: 전체 ${total}명 | 활성 ${remaining}명 | 비활성 ${total - remaining}명`);
    console.log(`📉 예상 바운스율: ${bouncedEmails.length}/${remaining} = ${((bouncedEmails.length / remaining) * 100).toFixed(2)}%`);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
