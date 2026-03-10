/**
 * SMTP 순차 실행 순서 테스트
 * - 실제 이메일 발송 없이 실행 순서와 타이밍만 검증
 * node scripts/test-smtp-sequence.js
 */
require('dotenv').config({ path: '.env.local' });

const MAX_PER_ACCOUNT = 1500;
const BATCH_SIZE = 100;

// ── Mock: 실제 SMTP 발송 대신 지연만 시뮬레이션 ──────────────────────────────
async function mockSendBccWithAccount(accountLabel, emails, batchSize) {
    const batches = [];
    for (let i = 0; i < emails.length; i += batchSize) {
        batches.push(emails.slice(i, i + batchSize));
    }
    let succeeded = 0;
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        // 실제 발송 대기 시뮬레이션 (10ms/배치)
        await new Promise(r => setTimeout(r, 10));
        succeeded += batch.length;
        console.log(`  [${accountLabel}] 배치 ${i + 1}/${batches.length} 완료 (${batch.length}명) | ts=${Date.now()}`);
    }
    return { succeeded, failed: 0, batchTotal: batches.length };
}

// ── 실제 sendNewsletterBccBatched 로직 그대로 재현 ────────────────────────────
async function testSequentialFlow(totalEmails, smtpAccount = 'both') {
    const toEmails = Array.from({ length: totalEmails }, (_, i) => `user${i + 1}@test.com`);

    const hasAccount2 = !!(process.env.SMTP_USER2 && process.env.SMTP_PASS2);
    const hasAccount3 = !!(process.env.SMTP_USER3 && process.env.SMTP_PASS3);

    let list1 = [], list2 = [], list3 = [];
    if (smtpAccount === 'account1') {
        list1 = toEmails.slice(0, MAX_PER_ACCOUNT);
    } else if (smtpAccount === 'account2' && hasAccount2) {
        list2 = toEmails.slice(0, MAX_PER_ACCOUNT);
    } else if (smtpAccount === 'account3' && hasAccount3) {
        list3 = toEmails.slice(0, MAX_PER_ACCOUNT);
    } else {
        let remaining = toEmails;
        list1 = remaining.slice(0, MAX_PER_ACCOUNT);
        remaining = remaining.slice(MAX_PER_ACCOUNT);
        if (remaining.length > 0 && hasAccount2) {
            list2 = remaining.slice(0, MAX_PER_ACCOUNT);
            remaining = remaining.slice(MAX_PER_ACCOUNT);
        }
        if (remaining.length > 0 && hasAccount3) {
            list3 = remaining.slice(0, MAX_PER_ACCOUNT);
        }
    }

    const timeline = [];
    let totalSucceeded = 0, totalBatches = 0;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 테스트: ${totalEmails}명, 모드: ${smtpAccount}`);
    console.log(`${'='.repeat(60)}`);

    // 계정1
    if (list1.length > 0) {
        const t0 = Date.now();
        console.log(`\n▶ 계정1 시작 (${list1.length}명) @ t=0ms`);
        timeline.push({ event: '계정1 시작', ms: 0 });
        const r1 = await mockSendBccWithAccount('계정1', list1, BATCH_SIZE);
        const t1 = Date.now() - t0;
        timeline.push({ event: '계정1 완료', ms: t1 });
        console.log(`✅ 계정1 완료 @ t=${t1}ms`);
        totalSucceeded += r1.succeeded;
        totalBatches += r1.batchTotal;

        // 계정2
        if (list2.length > 0 && hasAccount2) {
            console.log(`\n▶ 계정2 시작 (${list2.length}명) @ t=${Date.now() - t0}ms`);
            timeline.push({ event: '계정2 시작', ms: Date.now() - t0 });
            const r2 = await mockSendBccWithAccount('계정2', list2, BATCH_SIZE);
            const t2 = Date.now() - t0;
            timeline.push({ event: '계정2 완료', ms: t2 });
            console.log(`✅ 계정2 완료 @ t=${t2}ms`);
            totalSucceeded += r2.succeeded;
            totalBatches += r2.batchTotal;

            // 계정3
            if (list3.length > 0 && hasAccount3) {
                console.log(`\n▶ 계정3 시작 (${list3.length}명) @ t=${Date.now() - t0}ms`);
                timeline.push({ event: '계정3 시작', ms: Date.now() - t0 });
                const r3 = await mockSendBccWithAccount('계정3', list3, BATCH_SIZE);
                const t3 = Date.now() - t0;
                timeline.push({ event: '계정3 완료', ms: t3 });
                console.log(`✅ 계정3 완료 @ t=${t3}ms`);
                totalSucceeded += r3.succeeded;
                totalBatches += r3.batchTotal;
            }
        }
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📊 결과: 총 ${totalBatches}배치 | 성공 ${totalSucceeded}명`);
    console.log(`\n⏱️  실행 타임라인:`);
    timeline.forEach(e => console.log(`   ${e.ms.toString().padStart(5)}ms  → ${e.event}`));

    // 순서 검증
    const events = timeline.map(e => e.event);
    const expectedOrder = ['계정1 시작', '계정1 완료', '계정2 시작', '계정2 완료', '계정3 시작', '계정3 완료'];
    const filtered = events.filter(e => expectedOrder.includes(e));
    const isCorrectOrder = filtered.every((e, i) => e === expectedOrder[i] || i >= filtered.length);

    // 계정1 완료 후 계정2 시작 검증
    const c1end = timeline.find(e => e.event === '계정1 완료')?.ms || 0;
    const c2start = timeline.find(e => e.event === '계정2 시작')?.ms || 0;
    const c2end = timeline.find(e => e.event === '계정2 완료')?.ms || 0;
    const c3start = timeline.find(e => e.event === '계정3 시작')?.ms || 0;

    console.log(`\n🔍 순서 검증:`);
    if (list2.length > 0) {
        const seq12 = c2start >= c1end;
        console.log(`   계정1 완료(${c1end}ms) → 계정2 시작(${c2start}ms): ${seq12 ? '✅ 순차 확인' : '❌ 순서 오류!'}`);
    }
    if (list3.length > 0) {
        const seq23 = c3start >= c2end;
        console.log(`   계정2 완료(${c2end}ms) → 계정3 시작(${c3start}ms): ${seq23 ? '✅ 순차 확인' : '❌ 순서 오류!'}`);
    }
    console.log(`${'='.repeat(60)}\n`);
}

(async () => {
    // 시나리오 1: 4500명 균등 분산 (실제 사용 케이스)
    await testSequentialFlow(4500, 'both');

    // 시나리오 2: 1000명 (계정1만으로 충분)
    await testSequentialFlow(1000, 'both');
})();
