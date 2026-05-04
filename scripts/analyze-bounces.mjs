/**
 * 반송 메일 분석 스크립트 - 실제 실패 이메일 수를 정확히 카운트
 * node scripts/analyze-bounces.mjs
 */
import imaps from 'imap-simple';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const accounts = [
    { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS, label: '계정1' },
    { user: process.env.SMTP_USER2, pass: process.env.SMTP_APP_PASSWORD2 || process.env.SMTP_PASS2, label: '계정2' },
    { user: process.env.SMTP_USER3, pass: process.env.SMTP_APP_PASSWORD3 || process.env.SMTP_PASS3, label: '계정3' }
].filter(acc => acc.user && acc.pass);

async function analyzeAccount(account) {
    console.log(`\n=== ${account.label} (${account.user}) ===`);
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

        const fetchOptions = { bodies: [''], markSeen: false };
        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`총 반송 메일 수: ${messages.length}통`);

        // 각 방법으로 추출되는 이메일 수를 비교
        const finalRecipientEmails = new Set();   // RFC 3464 Final-Recipient (정확한 방법)
        const allEmailsFromBody = new Set();        // 본문 전체 정규식 (부정확한 방법)

        for (const item of messages) {
            const rawPart = item.parts.find(p => p.which === '');
            if (!rawPart) continue;
            const allText = String(rawPart.body || '');

            // 정확한 방법: RFC 3464 Final-Recipient 헤더만 추출
            const finalMatches = allText.matchAll(/Final-Recipient:\s*rfc822;\s*([^\s\r\n<>]+)/gi);
            for (const m of finalMatches) {
                const e = m[1].trim().toLowerCase();
                if (e.includes('@')) finalRecipientEmails.add(e);
            }

            // 부정확한 방법: 본문 전체에서 이메일 형태 추출 (과다 추출됨)
            const allMatches = allText.matchAll(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g);
            for (const m of allMatches) {
                const e = m[1].toLowerCase();
                if (!e.includes('google.com') && !e.includes('mailer-daemon') && !e.includes(account.user)) {
                    allEmailsFromBody.add(e);
                }
            }
        }

        console.log(`[정확한 방법] Final-Recipient 기반: ${finalRecipientEmails.size}개`);
        console.log(`[부정확한 방법] 본문 전체 정규식: ${allEmailsFromBody.size}개`);
        console.log('샘플 (Final-Recipient 기반):', [...finalRecipientEmails].slice(0, 5).join(', '));

        connection.end();
        return finalRecipientEmails;
    } catch (err) {
        console.error(`에러:`, err.message);
        if (connection) try { connection.end(); } catch (_) { }
        return new Set();
    }
}

async function main() {
    for (const acc of accounts) {
        await analyzeAccount(acc);
    }
}

main().catch(console.error);
