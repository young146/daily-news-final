import fs from 'fs';

// 두 env 파일 모두 로드 (Windows CRLF 대응)
function loadEnv(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const line of content.replace(/\r/g, '').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.substring(0, eqIdx).trim();
            let val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '').trim();
            if (!process.env[key]) process.env[key] = val;
        }
        console.log(`Loaded: ${filePath}`);
    } catch (e) {
        console.log(`Not found: ${filePath}`);
    }
}

// .env.local이 우선순위 높으므로 먼저 로드
loadEnv('.env.local');
loadEnv('.env');

const apiKey = (process.env.SENDGRID_API_KEY || '').trim();
console.log('SENDGRID_API_KEY starts with:', apiKey.substring(0, 8), '| length:', apiKey.length);

if (!apiKey) {
    console.error('❌ SENDGRID_API_KEY가 없습니다!');
    process.exit(1);
}

import('@sendgrid/mail').then(({ default: sgMail }) => {
    sgMail.setApiKey(apiKey);
    return sgMail.send({
        from: { email: 'info@chaovietnam.co.kr', name: 'XinChao Daily News' },
        to: 'xinchao.id@gmail.com',
        subject: '[Test] SendGrid 발송 테스트',
        html: '<h1>SendGrid 테스트 이메일입니다.</h1><p>이 이메일이 도착하면 SendGrid 연동 성공입니다!</p>',
    });
}).then(() => {
    console.log('✅ SendGrid 발송 성공!');
}).catch(err => {
    console.error('❌ SendGrid 발송 실패:', err.message);
    if (err.response) {
        console.error('응답 상세:', JSON.stringify(err.response.body, null, 2));
    }
});
