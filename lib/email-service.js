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

// ─── 4. SMTP 개별 발송 (동적 계정 전환 적용, 최대 한도 1500명/계정) ──
const MAX_PER_ACCOUNT = 1500;

export async function sendNewsletterIndividual(toEmails, subject, htmlContent, smtpAccount = 'both') {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0, failedEmails: [], succeededEmails: [], note: null };
    }

    const accounts = [];
    if (smtpAccount === 'account1' || smtpAccount === 'both') {
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            accounts.push({ user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, label: '계정1' });
        }
    }
    if (smtpAccount === 'account2' || smtpAccount === 'both') {
        if (process.env.SMTP_USER2 && process.env.SMTP_PASS2) {
            accounts.push({ user: process.env.SMTP_USER2, pass: process.env.SMTP_PASS2, label: '계정2' });
        }
    }
    if (smtpAccount === 'account3' || smtpAccount === 'both') {
        if (process.env.SMTP_USER3 && process.env.SMTP_PASS3) {
            accounts.push({ user: process.env.SMTP_USER3, pass: process.env.SMTP_PASS3, label: '계정3' });
        }
    }

    if (accounts.length === 0) {
        throw new Error('사용 가능한 SMTP 계정이 없습니다. 환경 변수를 확인하세요.');
    }

    console.log(`[SMTP] 총 ${toEmails.length}명 → 개별 동적 발송 시작 (사용 가능 계정 ${accounts.length}개)`);

    let totalSucceeded = 0;
    let totalFailed = 0;
    const allErrors = [];
    const allFailedEmails = [];
    const succeededEmails = [];

    let currentAccIdx = 0;
    let sentCountThisAccount = 0;
    let activeTransporter = null;

    const setupTransporter = async (acc) => {
        const t = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: process.env.SMTP_SECURE !== 'false',
            auth: { user: acc.user, pass: acc.pass },
        });
        try { await t.verify(); console.log(`[SMTP] ${acc.label} 연결 확인`); }
        catch (e) { console.warn(`[SMTP] ${acc.label} verify 실패 (발송은 시도합니다):`, e.message); }
        return t;
    };

    activeTransporter = await setupTransporter(accounts[currentAccIdx]);

    for (let i = 0; i < toEmails.length; i++) {
        const email = toEmails[i];
        let sent = false;
        let lastError = null;

        while (!sent && currentAccIdx < accounts.length) {
            // Check max limit
            if (sentCountThisAccount >= MAX_PER_ACCOUNT) {
                console.log(`[SMTP] ⚠️ ${accounts[currentAccIdx].label} 1일 한도(${MAX_PER_ACCOUNT}) 도달. 다음 계정으로 전환합니다.`);
                currentAccIdx++;
                sentCountThisAccount = 0;
                if (currentAccIdx < accounts.length) {
                    activeTransporter = await setupTransporter(accounts[currentAccIdx]);
                }
                continue;
            }

            const acc = accounts[currentAccIdx];
            try {
                await activeTransporter.sendMail({
                    from: `"${FROM_NAME}" <${acc.user}>`,
                    to: email, // 개별 전송
                    subject,
                    html: htmlContent,
                });
                sent = true;
                succeededEmails.push(email);
                totalSucceeded++;
                sentCountThisAccount++;

                if (totalSucceeded > 0 && totalSucceeded % 50 === 0) {
                    console.log(`  ✅ [${acc.label}] 발송 진행 중... 누적 ${totalSucceeded}명 성공`);
                }

                // 발송 성공 후 300ms 딜레이
                await new Promise(r => setTimeout(r, 300));
            } catch (err) {
                lastError = err;

                // 할당량 초과(550 5.4.5) 또는 인증 에러 시 계정 전환
                if (err.message.includes('5.4.5') || err.message.includes('quota') || err.message.includes('limit') || err.message.includes('Auth') || err.message.includes('credentials')) {
                    console.error(`  🚨 [${acc.label}] 발송 제한/인증 오류: ${err.message}. 다음 계정으로 전환합니다.`);
                    currentAccIdx++;
                    sentCountThisAccount = 0;
                    if (currentAccIdx < accounts.length) {
                        activeTransporter = await setupTransporter(accounts[currentAccIdx]);
                    }
                } else {
                    // 일반적인 수신자 오류(주소 없음 등)는 해당 계정으로 계속 다음 사람에게 발송
                    break;
                }
            }
        }

        if (!sent) {
            totalFailed++;
            const errorMsg = lastError ? lastError.message : '모든 계정 한도 초과 또는 사용 불가 상태';
            allFailedEmails.push({ email, errorMsg });

            // 오류 메시지 로깅을 조절 (전체 콘솔창 도배 방지)
            const logMsg = `[${accounts[currentAccIdx]?.label || '시스템'}] ${email} 발송 실패: ${errorMsg}`;
            allErrors.push(logMsg);
            if (i % 20 === 0) console.error(`  ❌ ${logMsg} (이하 유사 로그 생략)`);
        }
    }

    console.log(`[SMTP DONE] 총 발송 처리 ${toEmails.length}건 | 성공 ${totalSucceeded}명 | 실패 ${totalFailed}명`);

    // 너무 긴 에러 노트는 자르기
    let finalNote = allErrors.join(' | ');
    if (finalNote.length > 1000) finalNote = finalNote.substring(0, 995) + '...';

    return {
        batchTotal: toEmails.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
        note: finalNote || null,
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
