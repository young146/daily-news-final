/**
 * find-unsent.mjs
 * 오늘 이메일을 못 받은 구독자를 찾아 unsent-list.json으로 저장합니다.
 * 로직:
 *   1. DB 활성 구독자 전체를 id 순으로 조회
 *   2. 리스트 하위 50% (SMTP가 대부분 실패한 구간)
 *   3. 그 중 Resend CSV에도 없는 사람 = 확실히 못 받은 사람
 *
 * 실행: node scripts/find-unsent.mjs
 */

import { PrismaClient } from '@prisma/client';
import { createReadStream, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env'), override: false });

const prisma = new PrismaClient();
const CSV_PATH = resolve(process.cwd(), 'emails-sent-1773115599212.csv');
const TODAY = '2026-03-10'; // 오늘 날짜만 필터

async function main() {
    // 1. Resend CSV에서 오늘 시도된 이메일 목록 파싱
    const sentByResend = new Set();
    const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity });
    let firstLine = true;
    for await (const line of rl) {
        if (firstLine) { firstLine = false; continue; }
        if (!line.trim()) continue;
        const cols = line.split(',');
        const email = cols[4]?.trim().toLowerCase().replace(/^"|"$/g, '');
        const createdAt = cols[1]?.trim();
        if (email && createdAt && createdAt.startsWith(TODAY)) {
            sentByResend.add(email);
        }
    }
    console.log(`📧 Resend가 오늘 시도한 이메일: ${sentByResend.size}개`);

    // 2. DB 활성 구독자 전체 조회 (id 기준 정렬)
    const allActive = await prisma.subscriber.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true, email: true, name: true },
    });
    console.log(`👥 현재 활성 구독자: ${allActive.length}명`);

    // 3. 하위 50% 구간 (SMTP가 주로 실패한 구간)
    const midPoint = Math.ceil(allActive.length / 2);
    const bottom50 = allActive.slice(midPoint);
    console.log(`📊 하위 50% 구간: ${bottom50.length}명 (인덱스 ${midPoint} ~ ${allActive.length - 1})`);

    // 4. 그 중 Resend에서도 시도 안 된 사람 = 확실히 미발송
    const unsent = bottom50.filter(s => !sentByResend.has(s.email.toLowerCase()));
    console.log(`\n🎯 확실히 못 받은 사람: ${unsent.length}명`);

    // 5. 저장
    const outputPath = resolve(process.cwd(), 'unsent-list.json');
    writeFileSync(outputPath, JSON.stringify(unsent.map(s => s.email), null, 2));
    console.log(`✅ unsent-list.json 저장 완료 (${unsent.length}명)`);
    console.log(`\n[미리보기 10개]`);
    unsent.slice(0, 10).forEach((s, i) => console.log(`  ${i + 1}. ${s.email}${s.name ? ' (' + s.name + ')' : ''}`));

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
