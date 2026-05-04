// 반송 메일 원본 구조 확인용 스크립트
// 실행: node scripts/dump-raw-bounce.mjs

import imaps from 'imap-simple';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// 확인하고 싶은 계정 번호 선택 (1, 2, 3)
const ACCOUNT_NUM = 3;

const accountMap = {
    1: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASS },
    2: { user: process.env.SMTP_USER2, pass: process.env.SMTP_APP_PASSWORD2 || process.env.SMTP_PASS2 },
    3: { user: process.env.SMTP_USER3, pass: process.env.SMTP_APP_PASSWORD3 || process.env.SMTP_PASS3 },
};

const acc = accountMap[ACCOUNT_NUM];
console.log(`[DEBUG] 계정${ACCOUNT_NUM}: ${acc.user} 로 IMAP 연결 시도...`);
if (!acc.user || !acc.pass) {
    console.error('[ERROR] 계정 정보 없음. .env.local 확인');
    process.exit(1);
}

const config = {
    imap: {
        user: acc.user,
        password: acc.pass,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 15000,
        tlsOptions: { rejectUnauthorized: false }
    }
};

async function dumpBounce() {
    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    // 최근 3일치, Mailer-Daemon / postmaster / naver.com / Mail 등 다양하게
    const since = new Date();
    since.setDate(since.getDate() - 3);

    const searchCriteria = [['SINCE', since]];

    // 제목이나 보낸사람 필터 없이 다 가져와서 처음 10개의 raw 구조를 본다
    const fetchOptions = { bodies: ['HEADER.FIELDS (FROM SUBJECT TO)'], markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[DEBUG] 최근 3일 이내 수신된 이메일 총: ${messages.length}건`);

    // 처음 30개의 보낸사람(FROM)과 제목(SUBJECT)만 출력
    const sample = messages.slice(0, 30);
    const lines = [];
    for (const msg of sample) {
        const headerPart = msg.parts.find(p => p.which === 'HEADER.FIELDS (FROM SUBJECT TO)');
        const body = headerPart?.body;
        // imap-simple returns headers as an object like { from: [...], subject: [...] }
        if (body && typeof body === 'object') {
            const from = (body.from || body.FROM || ['(none)'])[0];
            const subject = (body.subject || body.SUBJECT || ['(none)'])[0];
            lines.push(`FROM: ${from}\nSUBJECT: ${subject}\n---`);
        } else {
            lines.push(String(body || '').replace(/\r/g, '').trim() + '\n---');
        }
    }
    const output = lines.join('\n');
    fs.writeFileSync('bounce_debug_output.txt', output, 'utf8');
    console.log('[DEBUG] 처음 30개 이메일 헤더를 bounce_debug_output.txt 에 저장했습니다.');
    console.log('\n--- 출력 미리보기 ---\n');
    console.log(output.substring(0, 2000));

    connection.end();
}

dumpBounce().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
