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

// ─── 3. SMTP 개별 발송 (단일 계정 내부 헬퍼) ────────────────────────────
async function sendIndividualWithAccount(transporter, senderEmail, toEmails, subject, htmlContent, label) {
    let succeeded = 0, failed = 0;
    const errors = [];
    const failedEmails = [];
    let consecutiveFailures = 0;

    for (let i = 0; i < toEmails.length; i++) {
        const email = toEmails[i];
        try {
            await transporter.sendMail({
                from: `"${FROM_NAME}" <${senderEmail}>`,
                to: email, // Bcc가 아닌 To로 개별 발송
                subject,
                html: htmlContent,
            });
            succeeded++;
            consecutiveFailures = 0;
            if (i > 0 && i % 50 === 0) {
                console.log(`  ✅ [${label}] 발송 진행 중... ${i}/${toEmails.length}명 성공`);
            }
        } catch (err) {
            failed++;
            consecutiveFailures++;
            failedEmails.push({ email, errorMsg: err.message });
            errors.push(`[${label}] ${email} 실패: ${err.message}`);
            // 너무 많은 로그가 찍히는 것을 방지
            // console.error(`  ❌ [${label}] ${email} 실패: ${err.message}`);

            if (consecutiveFailures >= 5) {
                console.error(`  🚨 [${label}] 연속 5회 실패. 계정 차단 의심됨. 해당 계정 발송 중단.`);
                errors.push(`[${label}] 연속 5회 실패로 발송 중단됨.`);
                break; // 계정 발송 중단
            }
        }
        // 발송 딜레이: 300ms (초당 약 3건)
        if (i < toEmails.length - 1) {
            await new Promise(r => setTimeout(r, 300));
        }
    }
    console.log(`  ✅ [${label}] 최종 결과: ${succeeded}명 성공, ${failed}명 실패`);
    return { succeeded, failed, batchTotal: toEmails.length, errors, failedEmails };
}

// ─── 4. SMTP 개별 순차 계정 발송 (계정1 → 계정2 → 계정3, 계정당 최대 1500명) ──
const MAX_PER_ACCOUNT = 1500;

export async function sendNewsletterIndividual(toEmails, subject, htmlContent, smtpAccount = 'both') {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0, failedEmails: [], succeededEmails: [] };
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

    console.log(`[SMTP] 총 ${toEmails.length}명 → 개별 순차 발송 시작 (계정당 최대 ${MAX_PER_ACCOUNT}명)`);
    if (list1.length > 0) console.log(`  계정1 (${process.env.SMTP_USER}): ${list1.length}명`);
    if (list2.length > 0) console.log(`  계정2 (${process.env.SMTP_USER2}): ${list2.length}명`);
    if (list3.length > 0) console.log(`  계정3 (${process.env.SMTP_USER3}): ${list3.length}명`);

    let totalSucceeded = 0, totalFailed = 0, totalBatches = 0;
    const allErrors = [];
    const allFailedEmails = [];

    const appendResults = (r) => {
        totalSucceeded += r.succeeded;
        totalFailed += r.failed;
        totalBatches += r.batchTotal;
        if (r.errors?.length) allErrors.push(...r.errors);
        if (r.failedEmails?.length) allFailedEmails.push(...r.failedEmails);
    };

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
        const r1 = await sendIndividualWithAccount(t1, process.env.SMTP_USER, list1, subject, htmlContent, '계정1');
        appendResults(r1);
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
        const r2 = await sendIndividualWithAccount(t2, process.env.SMTP_USER2, list2, subject, htmlContent, '계정2');
        appendResults(r2);
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
        const r3 = await sendIndividualWithAccount(t3, process.env.SMTP_USER3, list3, subject, htmlContent, '계정3');
        appendResults(r3);
    }

    console.log(`[SMTP DONE] 총 발송 처리 ${totalBatches}건 | 성공 ${totalSucceeded}명 | 실패 ${totalFailed}명`);

    const failedEmailStrings = allFailedEmails.map(f => f.email);
    const succeededEmails = toEmails.filter(email => !failedEmailStrings.includes(email));

    return {
        batchTotal: totalBatches,
        succeeded: totalSucceeded,
        failed: totalFailed,
        note: allErrors.join(' | ') || null,
        failedEmails: allFailedEmails,
        succeededEmails
    };
}

// ─── 4. 자동 폴백 발송 (Resend → SMTP 개별) ───────────────────────────────────
/**
 * Resend 발송을 먼저 시도하고, 실패하면 자동으로 SMTP 개별 방식으로 폴백합니다.
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
            result = await sendNewsletterIndividual(toEmails, subject, htmlContent, smtpAccount);
        } catch (smtpErr) {
            console.error('[이메일] SMTP 발송 실패:', smtpErr.message);
            result = { batchTotal: 0, succeeded: 0, failed: toEmails.length, note: smtpErr.message, failedEmails: [], succeededEmails: [] };
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
            result.failedEmails = [];
            result.succeededEmails = [];
        } catch (resendError) {
            console.warn('[이메일] Resend 실패, SMTP 개별 폴백으로 전환합니다...');
            console.warn('  Resend 오류:', resendError.message);
            try {
                result = await sendNewsletterIndividual(toEmails, subject, htmlContent);
                method = 'smtp';
            } catch (smtpError) {
                console.error('[이메일] SMTP 폴백도 실패:', smtpError.message);
                throw new Error(`Resend 실패: ${resendError.message} | SMTP 폴백 실패: ${smtpError.message}`);
            }
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
            console.log(`[이메일] 개별 발송 상세 결과 저장 중 (성공 ${result.succeededEmails?.length ?? 0}명, 실패 ${result.failedEmails?.length ?? 0}명)...`);
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

            // Chunk insertion
            for (let i = 0; i < detailData.length; i += 500) {
                const chunk = detailData.slice(i, i + 500);
                await prisma.emailSendDetail.createMany({ data: chunk });
            }
            console.log('[이메일] 개별 발송 상세 결과 DB 저장 완료');
        }
    } catch (logErr) {
        console.error('[이메일] 로그 저장 실패:', logErr.message, logErr.stack);
    }

    return { ...result, method };
}
