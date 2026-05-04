/**
 * ================================================================
 * 반송 이메일 자동 비활성화 스크립트
 * ================================================================
 *
 * 사용법:
 *   node scripts/auto-cleanup-bounces.mjs
 *
 * 기능:
 *   - 3개 Workspace Gmail 계정(info@, eric@, all@)의 받은편지함을
 *     IMAP으로 접속하여 최근 3일간의 반송(Delivery Failure) 메일을 스캔
 *   - RFC 3464 표준의 Final-Recipient 헤더에서 실제 실패한
 *     이메일 주소만 정확하게 추출
 *   - 해당 주소들을 DB에서 isActive: false 로 비활성화
 *
 * 주의사항:
 *   - 본문 전체 정규식 방식은 사용하지 않음
 *     (뉴스레터 원문이 반송 메일에 첨부되어 과다 추출될 수 있음)
 *   - 실행 후 앱의 [이메일 구독자 관리] > [비활성(OFF)] 필터로 결과 확인 가능
 * ================================================================
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

// ── 계정 설정 ──────────────────────────────────────────────────
const accounts = [
    { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS, label: '계정1 (info@)' },
    { user: process.env.SMTP_USER2, pass: process.env.SMTP_APP_PASSWORD2 || process.env.SMTP_PASS2, label: '계정2 (eric@)' },
    { user: process.env.SMTP_USER3, pass: process.env.SMTP_APP_PASSWORD3 || process.env.SMTP_PASS3, label: '계정3 (all@)' }
].filter(acc => acc.user && acc.pass);

// ── IMAP 에서 실제 반송된 이메일 수집 ─────────────────────────
async function collectBouncedEmails(account) {
    console.log(`\n[IMAP] ${account.label} 연결 중...`);

    const config = {
        imap: {
            user: account.user,
            password: account.pass,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            authTimeout: 15000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    let connection;
    const bounced = new Set();

    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        // 최근 3일치 반송 메일 검색
        const since = new Date();
        since.setDate(since.getDate() - 3);

        const searchCriteria = [
            ['SINCE', since],
            ['OR',
                ['OR', ['FROM', 'mailer-daemon'], ['FROM', 'postmaster']],
                ['SUBJECT', 'Delivery Status Notification']
            ]
        ];

        // '' = 이메일 전체 raw (RFC 2822 형식)
        const messages = await connection.search(searchCriteria, { bodies: [''], markSeen: false });

        if (!messages || messages.length === 0) {
            console.log(`  반송 메일 없음.`);
            connection.end();
            return bounced;
        }

        console.log(`  반송 메일 ${messages.length}통 발견. 파싱 중...`);

        for (const item of messages) {
            try {
                const rawPart = item.parts.find(p => p.which === '');
                const rawText = String(rawPart?.body || '');
                if (!rawText) continue;

                // RFC 3464: Final-Recipient 헤더 (가장 정확한 방법)
                for (const m of rawText.matchAll(/Final-Recipient:\s*rfc822;\s*([^\s\r\n<>]+)/gi)) {
                    const email = m[1].trim().toLowerCase().replace(/[<>]/g, '');
                    if (email.includes('@') && !email.includes('mailer-daemon')) bounced.add(email);
                }

                // RFC 3464: Original-Recipient 헤더 (보조)
                for (const m of rawText.matchAll(/Original-Recipient:\s*rfc822;\s*([^\s\r\n<>]+)/gi)) {
                    const email = m[1].trim().toLowerCase().replace(/[<>]/g, '');
                    if (email.includes('@') && !email.includes('mailer-daemon')) bounced.add(email);
                }

                // X-Failed-Recipients 헤더
                for (const m of rawText.matchAll(/X-Failed-Recipients?:\s*([^\r\n]+)/gi)) {
                    m[1].split(',').forEach(e => {
                        const email = e.trim().toLowerCase().replace(/[<>]/g, '');
                        if (email.includes('@') && !email.includes('mailer-daemon')) bounced.add(email);
                    });
                }
            } catch (_) {
                // 개별 메일 파싱 실패는 무시하고 계속 진행
            }
        }

        connection.end();
        console.log(`  실패 주소 발견: ${bounced.size}개`);

    } catch (err) {
        console.error(`  에러: ${err.message}`);
        if (connection) try { connection.end(); } catch (_) { }
    }

    return bounced;
}

// ── 메인 ───────────────────────────────────────────────────────
async function main() {
    console.log('\n========================================');
    console.log(' 📬 반송 이메일 자동 비활성화 스크립트 ');
    console.log('========================================');
    console.log(`설정된 계정: ${accounts.length}개`);

    if (accounts.length === 0) {
        console.error('\n❌ 설정된 계정이 없습니다. .env.local을 확인하세요.');
        process.exit(1);
    }

    // 모든 계정에서 반송 이메일 수집
    const allBounced = new Set();
    for (const account of accounts) {
        const bounced = await collectBouncedEmails(account);
        bounced.forEach(email => allBounced.add(email));
    }

    console.log(`\n총 고유 반송 주소: ${allBounced.size}개`);

    if (allBounced.size === 0) {
        console.log('✅ 비활성화할 반송 이메일이 없습니다.');
        await prisma.$disconnect();
        return;
    }

    // DB 비활성화
    console.log('DB 업데이트 중...');
    const result = await prisma.subscriber.updateMany({
        where: { email: { in: Array.from(allBounced) }, isActive: true },
        data: { isActive: false }
    });

    await prisma.$disconnect();
    console.log(`\n✅ 완료! ${result.count}명을 비활성화했습니다.`);
    console.log('앱의 [구독자 관리] > [비활성(OFF)] 필터로 결과를 확인하세요.\n');
}

main().catch(console.error);
