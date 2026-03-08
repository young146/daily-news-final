import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true' || true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * BCC 방식 단일 발송 (테스트 소량용)
 */
export async function sendNewsletter(toEmails, subject, htmlContent) {
    if (!toEmails || toEmails.length === 0) return;
    const info = await transporter.sendMail({
        from: `"XinChao Daily News" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: [],
        bcc: toEmails.join(','),
        subject,
        html: htmlContent,
    });
    console.log(`[BCC] ${toEmails.length}명 발송. ID: ${info.messageId}`);
    return info;
}

/**
 * 500명씩 BCC 배치 발송 (전체 발송용)
 * Gmail SMTP는 BCC 수신자 수 제한이 있어 500명씩 분할합니다.
 * 각 배치 실패 시 해당 배치를 로그에 기록하고 계속 진행합니다.
 *
 * @returns {{ batchTotal: number, succeeded: number, failed: number, failedBatches: number[][] }}
 */
export async function sendNewsletterBatched(toEmails, subject, htmlContent, batchSize = 500) {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0, failedBatches: [] };
    }

    const fromAddr = `"XinChao Daily News" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;
    const batches = [];
    for (let i = 0; i < toEmails.length; i += batchSize) {
        batches.push(toEmails.slice(i, i + batchSize));
    }

    let succeeded = 0;
    let failed = 0;
    const failedBatches = [];

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
            await transporter.sendMail({
                from: fromAddr,
                to: [],
                bcc: batch.join(','),
                subject,
                html: htmlContent,
            });
            succeeded += batch.length;
            console.log(`[BATCH ${i + 1}/${batches.length}] ✅ ${batch.length}명 성공`);
        } catch (err) {
            failed += batch.length;
            failedBatches.push(batch);
            console.error(`[BATCH ${i + 1}/${batches.length}] ❌ ${batch.length}명 실패:`, err.message);
        }

        // 배치 간 2초 대기 (Gmail 레이트 제한 방지)
        if (i < batches.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`[DONE] 총 ${batches.length}배치 | 성공 ${succeeded}명 | 실패 ${failed}명`);
    return { batchTotal: batches.length, succeeded, failed, failedBatches };
}
