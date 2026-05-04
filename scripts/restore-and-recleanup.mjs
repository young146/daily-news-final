/**
 * DB 복구 스크립트: 잘못 비활성화된 구독자를 다시 활성화한 후
 * 정확한 Final-Recipient 방식으로 실제 반송 이메일만 비활성화
 * 
 * 실행: node scripts/restore-and-recleanup.mjs
 */
import imaps from 'imap-simple';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const prisma = new PrismaClient();

const accounts = [
    { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS, label: '계정1' },
    { user: process.env.SMTP_USER2, pass: process.env.SMTP_APP_PASSWORD2 || process.env.SMTP_PASS2, label: '계정2' },
    { user: process.env.SMTP_USER3, pass: process.env.SMTP_APP_PASSWORD3 || process.env.SMTP_PASS3, label: '계정3' }
].filter(acc => acc.user && acc.pass);

async function getTrueBounces() {
    const allBounces = new Set();

    for (const account of accounts) {
        console.log(`\n[IMAP] ${account.label} (${account.user}) 반송 주소 수집 중...`);
        const config = {
            imap: {
                user: account.user, password: account.pass,
                host: 'imap.gmail.com', port: 993, tls: true,
                authTimeout: 15000, tlsOptions: { rejectUnauthorized: false }
            }
        };

        let connection;
        try {
            connection = await imaps.connect(config);
            await connection.openBox('INBOX');

            const since = new Date();
            since.setDate(since.getDate() - 3);

            const searchCriteria = [
                ['SINCE', since],
                ['OR',
                    ['OR', ['FROM', 'mailer-daemon'], ['FROM', 'postmaster']],
                    ['SUBJECT', 'Delivery Status Notification']
                ]
            ];

            const messages = await connection.search(searchCriteria, { bodies: [''], markSeen: false });
            console.log(`  반송 메일 ${messages.length}통 발견.`);

            for (const item of messages) {
                const rawPart = item.parts.find(p => p.which === '');
                const allText = String(rawPart?.body || '');

                // RFC 3464 Final-Recipient 만 추출 (정확한 방법)
                const finalMatches = allText.matchAll(/Final-Recipient:\s*rfc822;\s*([^\s\r\n<>]+)/gi);
                for (const m of finalMatches) {
                    const email = m[1].trim().toLowerCase().replace(/[<>]/g, '');
                    if (email.includes('@') && !email.includes('mailer-daemon')) {
                        allBounces.add(email);
                    }
                }

                const origMatches = allText.matchAll(/Original-Recipient:\s*rfc822;\s*([^\s\r\n<>]+)/gi);
                for (const m of origMatches) {
                    const email = m[1].trim().toLowerCase().replace(/[<>]/g, '');
                    if (email.includes('@') && !email.includes('mailer-daemon')) {
                        allBounces.add(email);
                    }
                }

                const xFailedMatches = allText.matchAll(/X-Failed-Recipients?:\s*([^\r\n]+)/gi);
                for (const m of xFailedMatches) {
                    m[1].split(',').forEach(e => {
                        const email = e.trim().toLowerCase().replace(/[<>]/g, '');
                        if (email.includes('@') && !email.includes('mailer-daemon')) {
                            allBounces.add(email);
                        }
                    });
                }
            }

            connection.end();
            console.log(`  ${account.label} 누적 실제 반송 주소: ${allBounces.size}개`);
        } catch (err) {
            console.error(`${account.label} 에러:`, err.message);
            if (connection) try { connection.end(); } catch (_) { }
        }
    }

    return allBounces;
}

async function main() {
    console.log('=== DB 복구 및 재정리 스크립트 ===\n');

    // STEP 1: 현재 비활성화된 구독자 수 확인
    console.log('STEP 1: 현재 비활성화된 구독자 수 확인...');
    const totalInactive = await prisma.subscriber.count({ where: { isActive: false } });
    console.log(`현재 비활성화된 구독자 수: ${totalInactive}명`);

    // STEP 2: 모든 비활성화된 구독자를 일단 활성화 (초기화)
    console.log('\nSTEP 2: 모든 비활성화 구독자를 일단 활성화 복구...');
    const restored = await prisma.subscriber.updateMany({
        where: { isActive: false },
        data: { isActive: true }
    });
    console.log(`✅ ${restored.count}명 복구 완료.`);

    // STEP 3: 정확한 방법으로 진짜 반송 이메일 수집
    console.log('\nSTEP 3: Final-Recipient 기반으로 실제 반송 이메일 수집...');
    const trueBounces = await getTrueBounces();
    console.log(`\n총 실제 반송 주소: ${trueBounces.size}개`);

    // STEP 4: 실제 반송 이메일만 비활성화
    console.log('\nSTEP 4: 실제 반송 이메일만 DB 비활성화...');
    const emailsArray = Array.from(trueBounces);
    const result = await prisma.subscriber.updateMany({
        where: { email: { in: emailsArray }, isActive: true },
        data: { isActive: false }
    });
    console.log(`⚡ ${result.count}명 비활성화 완료.`);

    await prisma.$disconnect();
    console.log('\n✅ 복구 및 재정리 완료!');
    console.log(`  복구된 구독자: ${restored.count}명`);
    console.log(`  실제 반송으로 비활성화: ${result.count}명`);
    console.log(`  순 복구: +${restored.count - result.count}명`);
}

main().catch(console.error);
