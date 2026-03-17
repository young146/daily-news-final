import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import prisma from './prisma.js';

const FROM_NAME = 'XinChao Daily News';
const FROM_EMAIL = 'info@chaovietnam.co.kr';

// ─── SendGrid 설정 ────────────────────────────────────────────────────────────
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// ─── 1. SendGrid 배치 발송 ────────────────────────────────────────────────────
export async function sendNewsletterSendGrid(toEmails, subject, htmlContent) {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0, failedEmails: [], succeededEmails: [] };
    }

    const BATCH_SIZE = 1000; // SendGrid 1회 요청 최대 1000명
    const batches = [];
    for (let i = 0; i < toEmails.length; i += BATCH_SIZE) {
        batches.push(toEmails.slice(i, i + BATCH_SIZE));
    }

    let totalSucceeded = 0;
    let totalFailed = 0;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
            const personalizations = batch.map(email => ({ to: [{ email }] }));
            await sgMail.send({
                personalizations,
                from: { email: FROM_EMAIL, name: FROM_NAME },
                subject,
                html: htmlContent,
            });
            totalSucceeded += batch.length;
            console.log(`  ✅ [SendGrid] 배치 ${i + 1}/${batches.length}: ${batch.length}명 성공`);
        } catch (err) {
            totalFailed += batch.length;
            console.error(`  ❌ [SendGrid] 배치 ${i + 1}/${batches.length} 실패:`, err.message);
            throw err; // 폴백으로 전환하도록 상위에 에러 전파
        }
    }

    console.log(`[SendGrid DONE] 총 ${batches.length}배치 | 성공 ${totalSucceeded}명 | 실패 ${totalFailed}명`);
    return { batchTotal: batches.length, succeeded: totalSucceeded, failed: totalFailed, failedEmails: [], succeededEmails: [] };
}

// ─── 2. SMTP BCC 통합 발송 (폴백용, 동적 계정 전환 적용) ─────────────────────
const MAX_BCC_PER_BATCH = 50;
const MAX_EMAILS_PER_ACCOUNT = 1200;

export async function sendNewsletterBatchedBccSmtp(toEmails, subject, htmlContent, smtpAccount = 'both') {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0, failedEmails: [], succeededEmails: [], note: null };
    }

    const accounts = [];
    if (smtpAccount === 'account1' || smtpAccount === 'both') {
        if (process.env.SMTP_USER && process.env.SMTP_PASS) accounts.push({ user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, label: '계정1' });
    }
    if (smtpAccount === 'account2' || smtpAccount === 'both') {
        if (process.env.SMTP_USER2 && process.env.SMTP_PASS2) accounts.push({ user: process.env.SMTP_USER2, pass: process.env.SMTP_PASS2, label: '계정2' });
    }
    if (smtpAccount === 'account3' || smtpAccount === 'both') {
        if (process.env.SMTP_USER3 && process.env.SMTP_PASS3) accounts.push({ user: process.env.SMTP_USER3, pass: process.env.SMTP_PASS3, label: '계정3' });
    }

    if (accounts.length === 0) {
        throw new Error('사용 가능한 SMTP 계정이 없습니다. 환경 변수를 확인하세요.');
    }

    const batches = [];
    for (let i = 0; i < toEmails.length; i += MAX_BCC_PER_BATCH) {
        batches.push(toEmails.slice(i, i + MAX_BCC_PER_BATCH));
    }

    console.log(`[SMTP BCC] 총 ${toEmails.length}명 → ${batches.length}개 묶음으로 분할 완료 (가용 계정 ${accounts.length}개)`);

    let totalSucceeded = 0;
    let totalFailed = 0;
    const allErrors = [];
    let currentAccIdx = 0;
    let sentCountThisAccount = 0;
    let activeTransporter = null;

    const setupTransporter = async (acc) => {
        const t = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: process.env.SMTP_SECURE !== 'false',
            pool: true,
            maxConnections: 1,
            auth: { user: acc.user, pass: acc.pass },
        });
        try { await t.verify(); } catch (e) { }
        return t;
    };

    activeTransporter = await setupTransporter(accounts[currentAccIdx]);

    for (let i = 0; i < batches.length; i++) {
        const batchEmails = batches[i];
        let sent = false;
        let lastError = null;

        while (!sent && currentAccIdx < accounts.length) {
            if (sentCountThisAccount + batchEmails.length > MAX_EMAILS_PER_ACCOUNT) {
                console.log(`[SMTP BCC] ⚠️ ${accounts[currentAccIdx].label} 안전 할당량(${MAX_EMAILS_PER_ACCOUNT}) 도달. 다음 계정으로 전환.`);
                try { activeTransporter.close(); } catch (_) { }
                currentAccIdx++;
                sentCountThisAccount = 0;
                if (currentAccIdx < accounts.length) {
                    activeTransporter = await setupTransporter(accounts[currentAccIdx]);
                }
                continue;
            }

            const acc = accounts[currentAccIdx];
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr';
            try {
                await activeTransporter.sendMail({
                    from: `"${FROM_NAME}" <${acc.user}>`,
                    replyTo: `"${FROM_NAME}" <${FROM_EMAIL}>`,
                    to: acc.user,
                    bcc: batchEmails,
                    subject,
                    text: `씬짜오베트남 데일리뉴스\n\n뉴스 터미널에서 전체 뉴스를 확인하세요:\nhttps://chaovietnam.co.kr/daily-news-terminal/\n\n수신 거부(Unsubscribe): ${baseUrl}/unsubscribe`,
                    html: htmlContent,
                    headers: {
                        'Precedence': 'bulk',
                        'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply',
                        'List-Unsubscribe': `<mailto:${FROM_EMAIL}?subject=unsubscribe>, <${baseUrl}/unsubscribe>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                        'List-Id': 'XinChao Vietnam Daily News <newsletter.chaovietnam.co.kr>',
                    }
                });

                sent = true;
                totalSucceeded += batchEmails.length;
                sentCountThisAccount += batchEmails.length;
                console.log(`  ✅ [${acc.label}] ${i + 1}번째 묶음 발송 성공 (${batchEmails.length}명)`);

                const delayMs = Math.floor(Math.random() * 3000) + 2000;
                await new Promise(r => setTimeout(r, delayMs));
            } catch (err) {
                lastError = err;
                console.error(`  🚨 [${acc.label}] ${i + 1}번째 묶음 에러: ${err.message}. 다음 계정으로 전환 후 재시도.`);
                try { activeTransporter.close(); } catch (_) { }
                currentAccIdx++;
                sentCountThisAccount = 0;
                if (currentAccIdx < accounts.length) {
                    activeTransporter = await setupTransporter(accounts[currentAccIdx]);
                }
            }
        }

        if (!sent) {
            totalFailed += batchEmails.length;
            const errorMsg = lastError ? lastError.message : '모든 계정 한도 초과';
            allErrors.push(`묶음 ${i + 1} 실패: ${errorMsg}`);
            console.error(`  ❌ ${i + 1}번째 묶음 최종 실패 처리 (누락: ${batchEmails.length}명)`);
        }
    }

    console.log(`[SMTP BCC DONE] 총 발송 그룹 ${batches.length}개 | 성공 ${totalSucceeded}명 | 실패 ${totalFailed}명`);

    let finalNote = allErrors.join(' | ');
    if (finalNote.length > 1000) finalNote = finalNote.substring(0, 995) + '...';

    return {
        batchTotal: batches.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
        note: finalNote || null,
        failedEmails: [],
        succeededEmails: []
    };
}

// ─── 3. 통합 발송 (SendGrid 우선 → SMTP BCC 폴백) ────────────────────────────
export async function sendNewsletterWithFallback(toEmails, subject, htmlContent, options = {}) {
    const { smtpAccount = 'both' } = options;
    let result, method;

    // SendGrid 우선 시도
    if (process.env.SENDGRID_API_KEY) {
        try {
            console.log('[이메일] SendGrid로 발송 시도 중...');
            result = await sendNewsletterSendGrid(toEmails, subject, htmlContent);
            console.log('[이메일] SendGrid 발송 완료');
            method = 'eservice';
        } catch (sgError) {
            console.warn('[이메일] SendGrid 실패, SMTP BCC 폴백으로 전환합니다...');
            console.warn('  SendGrid 오류:', sgError.message);
            try {
                result = await sendNewsletterBatchedBccSmtp(toEmails, subject, htmlContent, smtpAccount);
                method = 'smtp';
            } catch (smtpError) {
                console.error('[이메일] SMTP 폴백도 실패:', smtpError.message);
                throw new Error(`SendGrid 실패: ${sgError.message} | SMTP 폴백 실패: ${smtpError.message}`);
            }
        }
    } else {
        // SendGrid 키 없으면 SMTP 직접 사용
        console.log('[이메일] SENDGRID_API_KEY 없음. SMTP BCC로 발송...');
        try {
            result = await sendNewsletterBatchedBccSmtp(toEmails, subject, htmlContent, smtpAccount);
            method = 'smtp';
        } catch (smtpErr) {
            console.error('[이메일] SMTP 발송 실패:', smtpErr.message);
            result = { batchTotal: 0, succeeded: 0, failed: toEmails.length, note: smtpErr.message, failedEmails: [], succeededEmails: [] };
            method = 'smtp';
        }
    }

    // ── 발송 로그 DB 저장 ──────────────────────────────────────
    try {
        const log = await prisma.emailSendLog.create({
            data: {
                subject,
                method,
                total: toEmails.length,
                succeeded: result.succeeded ?? 0,
                failed: result.failed ?? 0,
                batches: result.batchTotal ?? 0,
                note: result.note ?? null,
            },
        });
        console.log('[이메일] 발송 로그 저장 완료. Log ID:', log.id);

        if (result.failedEmails?.length > 0 || result.succeededEmails?.length > 0) {
            const detailData = [];
            if (result.succeededEmails) {
                result.succeededEmails.forEach(email => {
                    detailData.push({ logId: log.id, email, status: 'success' });
                });
            }
            if (result.failedEmails) {
                result.failedEmails.forEach(({ email, errorMsg }) => {
                    detailData.push({ logId: log.id, email, status: 'failed', errorMsg });
                });
            }
            for (let i = 0; i < detailData.length; i += 500) {
                const chunk = detailData.slice(i, i + 500);
                await prisma.emailSendDetail.createMany({ data: chunk });
            }
        }
    } catch (logErr) {
        console.error('[이메일] 로그 저장 실패:', logErr.message, logErr.stack);
    }

    return { ...result, method };
}
