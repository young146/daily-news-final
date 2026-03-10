/**
 * SMTP 순차 발송 분배 로직 테스트 (실제 이메일 발송 없음)
 * node scripts/test-smtp-distribution.js
 */
require('dotenv').config({ path: '.env.local' });

const MAX_PER_ACCOUNT = 1500;

function simulateDistribution(totalEmails, smtpAccount = 'both') {
    // 가상 이메일 목록 생성
    const toEmails = Array.from({ length: totalEmails }, (_, i) => `user${i + 1}@example.com`);

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
            console.warn(`  ⚠️  한도 초과: ${remaining.length}명 발송 불가`);
        }
    }

    const total = list1.length + list2.length + list3.length;
    console.log(`\n${'='.repeat(55)}`);
    console.log(`📧 총 ${totalEmails}명 | 모드: ${smtpAccount}`);
    console.log(`${'='.repeat(55)}`);
    console.log(`  계정1 (${process.env.SMTP_USER || 'info@...'})  : ${list1.length}명`);
    console.log(`  계정2 (${process.env.SMTP_USER2 || 'N/A'})  : ${list2.length}명  ${!hasAccount2 ? '(환경변수 없음)' : ''}`);
    console.log(`  계정3 (${process.env.SMTP_USER3 || 'N/A'})  : ${list3.length}명  ${!hasAccount3 ? '(환경변수 없음)' : ''}`);
    console.log(`${'─'.repeat(55)}`);
    console.log(`  합계: ${total}명 / ${totalEmails}명 배분됨`);

    // 겹치는 이메일 없는지 검증
    const allAssigned = [...list1, ...list2, ...list3];
    const uniqueAssigned = new Set(allAssigned);
    const hasDuplicate = allAssigned.length !== uniqueAssigned.size;
    console.log(`  중복 발송 여부: ${hasDuplicate ? '❌ 중복 있음!' : '✅ 중복 없음'}`);
    console.log(`  전체 배분 완료: ${total === Math.min(totalEmails, MAX_PER_ACCOUNT * (1 + (hasAccount2 ? 1 : 0) + (hasAccount3 ? 1 : 0))) ? '✅' : '⚠️'}`);
    console.log(`${'='.repeat(55)}\n`);
}

console.log('\n🔍 환경변수 확인:');
console.log(`  SMTP_USER  : ${process.env.SMTP_USER ? '✅' : '❌ 없음'}`);
console.log(`  SMTP_PASS  : ${process.env.SMTP_PASS ? '✅' : '❌ 없음'}`);
console.log(`  SMTP_USER2 : ${process.env.SMTP_USER2 ? '✅' : '❌ 없음'}`);
console.log(`  SMTP_PASS2 : ${process.env.SMTP_PASS2 ? '✅' : '❌ 없음'}`);
console.log(`  SMTP_USER3 : ${process.env.SMTP_USER3 ? '✅' : '❌ 없음'}`);
console.log(`  SMTP_PASS3 : ${process.env.SMTP_PASS3 ? '✅' : '❌ 없음'}`);

// ── 시나리오별 테스트 ──────────────────────────────────────────────────────
// 1. 실제 구독자 수 (4500명) - 균등 분산
simulateDistribution(4500, 'both');

// 2. 1500명 이하 (계정1만으로 충분)
simulateDistribution(1200, 'both');

// 3. 3001명 (계정1+2는 부족, 계정3까지 필요)
simulateDistribution(3001, 'both');

// 4. 5000명 (한도 초과 케이스)
simulateDistribution(5000, 'both');

// 5. 계정2 단독 지정
simulateDistribution(4500, 'account2');
