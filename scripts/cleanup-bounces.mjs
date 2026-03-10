/**
 * cleanup-bounces.mjs
 * Resend API에서 바운스된 이메일 전체를 가져와 DB에서 비활성화합니다.
 *
 * 실행: node scripts/cleanup-bounces.mjs
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as dotenvLocal from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// .env.local → .env 순서로 로드
const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
if (existsSync(envPath)) dotenv.config({ path: envPath, override: false });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY 환경변수가 없습니다.');
    process.exit(1);
}

const prisma = new PrismaClient();

// Resend API에서 바운스 이메일 전체 조회 (페이지네이션)
async function fetchAllBounced() {
    const bouncedEmails = new Set();
    let offset = 0;
    const limit = 100;

    console.log('📡 Resend API에서 바운스 목록 조회 중...');

    while (true) {
        const url = `https://api.resend.com/emails?limit=${limit}&offset=${offset}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        });

        if (!res.ok) {
            const err = await res.text();
            console.error(`❌ Resend API 오류 (offset=${offset}):`, err);
            break;
        }

        const data = await res.json();
        const emails = data.data || [];

        if (emails.length === 0) break;

        let foundInPage = 0;
        for (const email of emails) {
            // last_event가 bounced인 항목 수집
            if (email.last_event === 'bounced' || email.last_event === 'complained') {
                const to = Array.isArray(email.to) ? email.to : [email.to];
                to.forEach(addr => bouncedEmails.add(addr.toLowerCase().trim()));
                foundInPage++;
            }
        }

        console.log(`  페이지 offset=${offset}: ${emails.length}건 조회, 바운스 ${foundInPage}건 발견`);

        // 마지막 페이지
        if (emails.length < limit) break;
        offset += limit;
    }

    return [...bouncedEmails];
}

async function main() {
    try {
        const bounced = await fetchAllBounced();
        console.log(`\n✅ 총 바운스 이메일: ${bounced.length}개`);

        if (bounced.length === 0) {
            console.log('처리할 바운스 이메일이 없습니다.');
            return;
        }

        // 상위 20개 미리보기
        console.log('\n[바운스 목록 미리보기 (최대 20개)]');
        bounced.slice(0, 20).forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
        if (bounced.length > 20) console.log(`  ... 외 ${bounced.length - 20}개`);

        // DB에서 해당 이메일 구독자 비활성화
        console.log('\n🗄️  DB에서 바운스 구독자 비활성화 중...');
        const result = await prisma.subscriber.updateMany({
            where: {
                email: { in: bounced },
                isActive: true,
            },
            data: { isActive: false },
        });

        console.log(`✅ 비활성화 완료: ${result.count}명`);
        console.log(`   (DB에 없거나 이미 비활성화된 이메일은 제외됨)`);

        // 남은 활성 구독자 수
        const remaining = await prisma.subscriber.count({ where: { isActive: true } });
        console.log(`\n📊 현재 활성 구독자: ${remaining.toLocaleString()}명`);

    } catch (err) {
        console.error('❌ 오류:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
