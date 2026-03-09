import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'XinChao Daily News <info@chaovietnam.co.kr>';

/**
 * 단건 또는 소량 발송 (테스트용)
 */
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

/**
 * 대규모 배치 발송 (전체 구독자용)
 * Resend Batch API: 100명씩 묶어 개별 이메일 발송 (BCC 아님).
 * 10배치씩 병렬 처리 → 약 5그룹 × 수초 = 전체 10~20초 내 완료.
 *
 * @returns {{ batchTotal: number, succeeded: number, failed: number }}
 */
export async function sendNewsletterBatched(toEmails, subject, htmlContent, batchSize = 100) {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0 };
    }

    // 100명씩 배치로 나누기
    const batches = [];
    for (let i = 0; i < toEmails.length; i += batchSize) {
        batches.push(toEmails.slice(i, i + batchSize));
    }

    let succeeded = 0;
    let failed = 0;
    const PARALLEL = 10; // 동시에 처리할 배치 수

    // 10배치씩 병렬 처리
    for (let g = 0; g < batches.length; g += PARALLEL) {
        const group = batches.slice(g, g + PARALLEL);
        const groupIndex = Math.floor(g / PARALLEL) + 1;
        const totalGroups = Math.ceil(batches.length / PARALLEL);

        console.log(`[GROUP ${groupIndex}/${totalGroups}] ${group.length}배치 병렬 발송 시작...`);

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
                    console.log(`  ✅ 배치 ${g + idx + 1}/${batches.length}: ${batch.length}명 성공`);
                    return batch.length;
                });
            })
        );

        for (let i = 0; i < results.length; i++) {
            if (results[i].status === 'fulfilled') {
                succeeded += results[i].value;
            } else {
                failed += group[i].length;
                console.error(`  ❌ 배치 ${g + i + 1}/${batches.length} 실패:`, results[i].reason?.message);
            }
        }

        // 그룹 간 1초 대기 (레이트 제한 방지)
        if (g + PARALLEL < batches.length) {
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    console.log(`[DONE] 총 ${batches.length}배치 | 성공 ${succeeded}명 | 실패 ${failed}명`);
    return { batchTotal: batches.length, succeeded, failed };
}
