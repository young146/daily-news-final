const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'lib', 'email-service.js');
let code = fs.readFileSync(targetPath, 'utf8');

const regex = /\/\/ ─── 4\. SMTP 개별 발송([\s\S]*?)export async function sendNewsletterWithFallback/m;

const replacement = `// ─── 4. SMTP BCC 통합 발송 (동적 계정 전환 적용, 최대 한도 1200명/계정) ──
const MAX_BCC_PER_BATCH = 400; // 한 번에 보낼 최대 BCC 인원 (구글 한도 500 내로 안전하게)
const MAX_EMAILS_PER_ACCOUNT = 1200; // 계정당 3묶음(1200명)만 처리하고 다음 계정으로 안전하게 넘김

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

    // 이메일을 400개 단위 묶음(Batch) 배열로 쪼개기
    const batches = [];
    for (let i = 0; i < toEmails.length; i += MAX_BCC_PER_BATCH) {
        batches.push(toEmails.slice(i, i + MAX_BCC_PER_BATCH));
    }

    console.log(\`[SMTP BCC] 총 \${toEmails.length}명 → \${batches.length}개 묶음으로 분할 완료 (가용 계정 \${accounts.length}개)\`);

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
        try { await t.verify(); } catch (e) {} // 묵시적 에러 무시
        return t;
    };

    activeTransporter = await setupTransporter(accounts[currentAccIdx]);

    for (let i = 0; i < batches.length; i++) {
        const batchEmails = batches[i];
        let sent = false;
        let lastError = null;

        while (!sent && currentAccIdx < accounts.length) {
            // 한 계정이 1200명을 넘기려 하면 다음 계정으로 피신
            if (sentCountThisAccount + batchEmails.length > MAX_EMAILS_PER_ACCOUNT) {
                console.log(\`[SMTP BCC] ⚠️ \${accounts[currentAccIdx].label} 안전 할당량(\${MAX_EMAILS_PER_ACCOUNT}) 도달. 다음 계정으로 전환.\`);
                try { activeTransporter.close(); } catch (_) { }
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
                    from: \`"\${FROM_NAME}" <\${acc.user}>\`,
                    to: acc.user, // 수신자(To)는 자기 자신 메일
                    bcc: batchEmails, // 숨은 참조(BCC)로 400명을 한 번에 쏨
                    subject,
                    html: htmlContent,
                });
                
                sent = true;
                totalSucceeded += batchEmails.length;
                sentCountThisAccount += batchEmails.length;

                console.log(\`  ✅ [\${acc.label}] \${i + 1}번째 묶음 발송 성공 (\${batchEmails.length}명)\`);

                // 묶음 사이 2초 대기하여 구글 스팸 필터 회피
                await new Promise(r => setTimeout(r, 2000));
            } catch (err) {
                lastError = err;
                console.error(\`  🚨 [\${acc.label}] \${i + 1}번째 묶음 에러: \${err.message}. 다음 계정으로 전환 후 재시도.\`);
                
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
            allErrors.push(\`묶음 \${i + 1} 실패: \${errorMsg}\`);
            console.error(\`  ❌ \${i + 1}번째 묶음 최종 실패 처리 (누락: \${batchEmails.length}명)\`);
        }
    }

    console.log(\`[SMTP BCC DONE] 총 발송 그룹 \${batches.length}개 | 성공 \${totalSucceeded}명 | 실패 \${totalFailed}명\`);

    let finalNote = allErrors.join(' | ');
    if (finalNote.length > 1000) finalNote = finalNote.substring(0, 995) + '...';

    return {
        batchTotal: batches.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
        note: finalNote || null,
        failedEmails: [],     // BCC 그룹이므로 개별 추적 불가
        succeededEmails: []   // 대신 EmailSendLog의 큰 숫자 기록에 의존
    };
}

// ─── 4. 자동 폴백 발송 (Resend → SMTP 개별) ───────────────────────────────────
export async function sendNewsletterWithFallback`;

code = code.replace(regex, replacement);

// Next we must replace the inner call in sendNewsletterWithFallback
// from sendNewsletterIndividual to sendNewsletterBatchedBccSmtp
code = code.replace(/result = await sendNewsletterIndividual\(toEmails, subject, htmlContent, smtpAccount\)/g, 
                   'result = await sendNewsletterBatchedBccSmtp(toEmails, subject, htmlContent, smtpAccount)');
                   
code = code.replace(/result = await sendNewsletterIndividual\(toEmails, subject, htmlContent\)/g, 
                   'result = await sendNewsletterBatchedBccSmtp(toEmails, subject, htmlContent)');

fs.writeFileSync(targetPath, code);
console.log('Successfully refactored lib/email-service.js to use BCC chunks!');
