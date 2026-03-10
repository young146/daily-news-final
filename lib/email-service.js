import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import prisma from './prisma.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'XinChao Daily News <info@chaovietnam.co.kr>';
const FROM_NAME = 'XinChao Daily News';

// ─── SMTP transporter (Gmail BCC 폴백용) ─────────────────────────────────────
function createSmtpTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: process.env.SMTP_SECURE !== 'false', // true for 465
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

// ─── 1. Resend 단건 발송 (테스트용) ───────────────────────────────────────────
export async function sendNewsletter(toEmails, subject, htmlContent) {
    if (!toEmails || toEmails.length === 0) return;

    const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: toEmails,
        subject,
        html: htmlContent,
    });

    console.log(`[Resend] ${toEmails.length}명 발송. ID: ${result.data?.id}`);
    return result;
}

// ─── 2. Resend 배치 발송 (100명씩 개별) ──────────────────────────────────────
export async function sendNewsletterBatched(toEmails, subject, htmlContent, batchSize = 100) {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0 };
    }

    const batches = [];
    for (let i = 0; i < toEmails.length; i += batchSize) {
        batches.push(toEmails.slice(i, i + batchSize));
    }

    let succeeded = 0;
    let failed = 0;
    const PARALLEL = 10;

    for (let g = 0; g < batches.length; g += PARALLEL) {
        const group = batches.slice(g, g + PARALLEL);
        const groupIndex = Math.floor(g / PARALLEL) + 1;
        const totalGroups = Math.ceil(batches.length / PARALLEL);

        console.log(`[Resend GROUP ${groupIndex}/${totalGroups}] ${group.length}배치 병렬 발송 시작...`);

        const results = await Promise.allSettled(
            group.map((batch, idx) => {
                const emailObjects = batch.map(email => ({
                    from: FROM_EMAIL,
                    to: [email],
                    subject,
                    html: htmlContent,
                }));
                return resend.batch.send(emailObjects).then(result => {
                    if (result.error) throw new Error(result.error.message);
                    console.log(`  ✅ Resend 배치 ${g + idx + 1}/${batches.length}: ${batch.length}명 성공`);
                    return batch.length;
                });
            })
        );

        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'fulfilled') {
                succeeded += results[i].value;
            } else {
                failed += group[i].length;
                console.error(`  ❌ Resend 배치 ${g + i + 1}/${batches.length} 실패:`, results[i].reason?.message);
            }
        }

        if (g + PARALLEL < batches.length) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    console.log(`[Resend DONE] 총 ${batches.length}배치 | 성공 ${succeeded}명 | 실패 ${failed}명`);
    return { batchTotal: batches.length, succeeded, failed };
}

// ─── 3. SMTP BCC 배치 발송 (단일 계정 내부 헬퍼) ────────────────────────────
async function sendBccWithAccount(transporter, senderEmail, toEmails, subject, htmlContent, batchSize, label) {
    const batches = [];
    for (let i = 0; i < toEmails.length; i += batchSize) {
        batches.push(toEmails.slice(i, i + batchSize));
    }
    let succeeded = 0, failed = 0;
    const errors = [];
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
            await transporter.sendMail({
                from: `"${FROM_NAME}" <${senderEmail}>`,
                to: senderEmail,
                bcc: batch,
                subject,
                html: htmlContent,
            });
            succeeded += batch.length;
            console.log(`  ✅ [${label}] 배치 ${i + 1}/${batches.length}: ${batch.length}명 성공`);
            if (i < batches.length - 1) await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
            failed += batch.length;
            const msg = `[${label}] 배치${i + 1} 실패: ${err.message}`;
            errors.push(msg);
            console.error(`  ❌ ${msg}`);
        }
    }
    return { succeeded, failed, batchTotal: batches.length, errors };
}

// ─── 4. SMTP BCC 순차 계정 발송 (계정1 → 계정2 → 계정3, 계정당 최대 1500명) ──
const MAX_PER_ACCOUNT = 1500;

export async function sendNewsletterBccBatched(toEmails, subject, htmlContent, batchSize = 100, smtpAccount = 'both') {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0 };
    }
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP 환경변수(SMTP_USER, SMTP_PASS)가 설정되지 않았습니다.');
    }

    const hasAccount2 = !!(process.env.SMTP_USER2 && process.env.SMTP_PASS2);
    const hasAccount3 = !!(process.env.SMTP_USER3 && process.env.SMTP_PASS3);

    // ── 계정별 발송 목록 결정 ──────────────────────────────────────────────────
    let list1 = [], list2 = [], list3 = [];

    if (smtpAccount === 'account1') {
        list1 = toEmails.slice(0, MAX_PER_ACCOUNT);
    } else if (smtpAccount === 'account2' && hasAccount2) {
        list2 = toEmails.slice(0, MAX_PER_ACCOUNT);
    } else if (smtpAccount === 'account3' && hasAccount3) {
        list3 = toEmails.slice(0, MAX_PER_ACCOUNT);
    } else {
        // 'both': 계정1 → 계정2 → 계정3 순서로 최대 1500명씩 순차 배분
        let remaining = toEmails;
        list1 = remaining.slice(0, MAX_PER_ACCOUNT);
        remaining = remaining.slice(MAX_PER_ACCOUNT);
        if (remaining.length > 0 && hasAccount2) {
            list2 = remaining.slice(0, MAX_PER_ACCOUNT);
            remaining = remaining.slice(MAX_PER_ACCOUNT);
        }
        if (remaining.length > 0 && hasAccount3) {
            list3 = remaining.slice(0, MAX_PER_ACCOUNT);
            remaining = remaining.slice(MAX_PER_ACCOUNT);
        }
        if (remaining.length > 0) {
            console.warn(`[SMTP] ⚠️ 계정 한도 초과로 ${remaining.length}명 발송 불가 (오늘 최대 ${MAX_PER_ACCOUNT * (1 + (hasAccount2 ? 1 : 0) + (hasAccount3 ? 1 : 0))}명)`);
        }
    }

    console.log(`[SMTP] 총 ${toEmails.length}명 → 순차 발송 시작 (계정당 최대 ${MAX_PER_ACCOUNT}명)`);
    if (list1.length > 0) console.log(`  계정1 (${process.env.SMTP_USER}): ${list1.length}명`);
    if (list2.length > 0) console.log(`  계정2 (${process.env.SMTP_USER2}): ${list2.length}명`);
    if (list3.length > 0) console.log(`  계정3 (${process.env.SMTP_USER3}): ${list3.length}명`);

    let totalSucceeded = 0, totalFailed = 0, totalBatches = 0;
    const allErrors = [];

    // ── 계정1 발송 ────────────────────────────────────────────────────────────
    if (list1.length > 0) {
        const t1 = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: process.env.SMTP_SECURE !== 'false',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        try { await t1.verify(); console.log('[SMTP] 계정1 연결 확인'); }
        catch (e) { console.warn('[SMTP] 계정1 verify 실패:', e.message); }
        const r1 = await sendBccWithAccount(t1, process.env.SMTP_USER, list1, subject, htmlContent, batchSize, '계정1');
        totalSucceeded += r1.succeeded; totalFailed += r1.failed; totalBatches += r1.batchTotal;
        if (r1.errors?.length) allErrors.push(...r1.errors);
    }

    // ── 계정2 발송 (계정1 완료 후 시작) ──────────────────────────────────────
    if (list2.length > 0 && hasAccount2) {
        console.log('[SMTP] 계정1 완료 → 계정2 시작');
        const t2 = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: process.env.SMTP_USER2, pass: process.env.SMTP_PASS2 },
        });
        try { await t2.verify(); console.log('[SMTP] 계정2 연결 확인'); }
        catch (e) { console.warn('[SMTP] 계정2 verify 실패:', e.message); }
        const r2 = await sendBccWithAccount(t2, process.env.SMTP_USER2, list2, subject, htmlContent, batchSize, '계정2');
        totalSucceeded += r2.succeeded; totalFailed += r2.failed; totalBatches += r2.batchTotal;
        if (r2.errors?.length) allErrors.push(...r2.errors);
    }

    // ── 계정3 발송 (계정2 완료 후 시작) ──────────────────────────────────────
    if (list3.length > 0 && hasAccount3) {
        console.log('[SMTP] 계정2 완료 → 계정3 시작');
        const t3 = nodemailer.createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: process.env.SMTP_USER3, pass: process.env.SMTP_PASS3 },
        });
        try { await t3.verify(); console.log('[SMTP] 계정3 연결 확인'); }
        catch (e) { console.warn('[SMTP] 계정3 verify 실패:', e.message); }
        const r3 = await sendBccWithAccount(t3, process.env.SMTP_USER3, list3, subject, htmlContent, batchSize, '계정3');
        totalSucceeded += r3.succeeded; totalFailed += r3.failed; totalBatches += r3.batchTotal;
        if (r3.errors?.length) allErrors.push(...r3.errors);
    }

    console.log(`[SMTP DONE] 총 ${totalBatches}배치 | 성공 ${totalSucceeded}명 | 실패 ${totalFailed}명`);
    return { batchTotal: totalBatches, succeeded: totalSucceeded, failed: totalFailed, note: allErrors.join(' | ') || null };
}

// ─── 4. 자동 폴백 발송 (Resend → SMTP BCC) ───────────────────────────────────
/**
 * Resend 발송을 먼저 시도하고, 실패하면 자동으로 SMTP BCC 방식으로 폴백합니다.
 * @param {string[]} toEmails - 수신자 목록
 * @param {string} subject - 제목
 * @param {string} htmlContent - HTML 본문
 * @param {{ forceSmtp?: boolean }} options
 * @returns {{ batchTotal, succeeded, failed, method: 'resend'|'smtp' }}
 */
export async function sendNewsletterWithFallback(toEmails, subject, htmlContent, options = {}) {
    const { forceSmtp = false } = options;
    let result, method;

    // 강제 SMTP 모드
    if (forceSmtp) {
        console.log('[이메일] SMTP 강제 모드로 발송합니다...');
        const { smtpAccount = 'both' } = options;
        try {
            result = await sendNewsletterBccBatched(toEmails, subject, htmlContent, 100, smtpAccount);
        } catch (smtpErr) {
            console.error('[이메일] SMTP 발송 실패:', smtpErr.message);
            result = { batchTotal: 0, succeeded: 0, failed: toEmails.length, note: smtpErr.message };
        }
        method = 'smtp';
    } else {
        // Resend 먼저 시도
        try {
            console.log('[이메일] Resend로 발송 시도 중...');
            result = await sendNewsletterBatched(toEmails, subject, htmlContent);
            if (result.failed > 0 && result.succeeded === 0) {
                throw new Error(`Resend 전체 실패: ${result.failed}명 발송 실패`);
            }
            console.log('[이메일] Resend 발송 완료');
            method = 'resend';
        } catch (resendError) {
            console.warn('[이메일] Resend 실패, SMTP BCC 폴백으로 전환합니다...');
            console.warn('  Resend 오류:', resendError.message);
            try {
                result = await sendNewsletterBccBatched(toEmails, subject, htmlContent);
                method = 'smtp';
            } catch (smtpError) {
                console.error('[이메일] SMTP 폴백도 실패:', smtpError.message);
                throw new Error(`Resend 실패: ${resendError.message} | SMTP 폴백 실패: ${smtpError.message}`);
            }
        }
    }

    // ── 발송 로그 DB 저장 ──────────────────────────────────────
    try {
        await prisma.emailSendLog.create({
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
        console.log('[이메일] 발송 로그 저장 완료');
    } catch (logErr) {
        console.error('[이메일] 로그 저장 실패:', logErr.message, logErr.stack);
    }

    return { ...result, method };
}
