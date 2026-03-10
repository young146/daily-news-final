import { Resend } from 'resend';
import nodemailer from 'nodemailer';

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

// ─── 3. SMTP BCC 배치 발송 (100명씩 BCC) ─────────────────────────────────────
export async function sendNewsletterBccBatched(toEmails, subject, htmlContent, batchSize = 100) {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0 };
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP 환경변수(SMTP_USER, SMTP_PASS)가 설정되지 않았습니다.');
    }

    const transporter = createSmtpTransporter();

    // 연결 테스트
    await transporter.verify();
    console.log('[SMTP] 서버 연결 확인 완료');

    const batches = [];
    for (let i = 0; i < toEmails.length; i += batchSize) {
        batches.push(toEmails.slice(i, i + batchSize));
    }

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
            await transporter.sendMail({
                from: `"${FROM_NAME}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
                to: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER, // To: 발신자 자신 (BCC 방식)
                bcc: batch,
                subject,
                html: htmlContent,
            });
            succeeded += batch.length;
            console.log(`  ✅ SMTP BCC 배치 ${i + 1}/${batches.length}: ${batch.length}명 성공`);

            // Gmail 발송 제한 방지: 배치 간 1.5초 대기
            if (i < batches.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
            }
        } catch (err) {
            failed += batch.length;
            console.error(`  ❌ SMTP BCC 배치 ${i + 1}/${batches.length} 실패:`, err.message);
        }
    }

    console.log(`[SMTP DONE] 총 ${batches.length}배치 | 성공 ${succeeded}명 | 실패 ${failed}명`);
    return { batchTotal: batches.length, succeeded, failed };
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

    // 강제 SMTP 모드
    if (forceSmtp) {
        console.log('[이메일] SMTP 강제 모드로 발송합니다...');
        const result = await sendNewsletterBccBatched(toEmails, subject, htmlContent);
        return { ...result, method: 'smtp' };
    }

    // Resend 먼저 시도
    try {
        console.log('[이메일] Resend로 발송 시도 중...');
        const result = await sendNewsletterBatched(toEmails, subject, htmlContent);

        // Resend가 전부 실패한 경우 폴백 (succeeded가 0이고 failed가 있을 때)
        if (result.failed > 0 && result.succeeded === 0) {
            throw new Error(`Resend 전체 실패: ${result.failed}명 발송 실패`);
        }

        console.log('[이메일] Resend 발송 완료');
        return { ...result, method: 'resend' };

    } catch (resendError) {
        console.warn('[이메일] Resend 실패, SMTP BCC 폴백으로 전환합니다...');
        console.warn('  Resend 오류:', resendError.message);

        try {
            const result = await sendNewsletterBccBatched(toEmails, subject, htmlContent);
            return { ...result, method: 'smtp' };
        } catch (smtpError) {
            console.error('[이메일] SMTP 폴백도 실패:', smtpError.message);
            throw new Error(`Resend 실패: ${resendError.message} | SMTP 폴백 실패: ${smtpError.message}`);
        }
    }
}
