import { PrismaClient } from '@prisma/client';
import { sendNewsletterWithFallback } from '../lib/email-service.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const prisma = new PrismaClient();

async function runTest() {
    console.log("=== 테스트 시작 ===");
    try {
        // 1. 발송 대상 (테스트용)
        const toEmails = ['xinchao.id@gmail.com', 'invalid-email-xyz123@chaovietnam.co.kr']; // 유효한 것 하나, 실패할 것 하나
        const subject = "[Test] SMTP 개별 발송 테스트";
        const htmlContent = "<h1>이것은 테스트 이메일입니다.</h1><p>BCC 배치 발송 대신 개별 발송이 잘 되는지 확인합니다.</p>";

        console.log(`발송 대상: ${toEmails.join(', ')}`);

        // 2. SMTP 강제 발송
        console.log("\n[1] 강제 SMTP 발송 테스트 진행...");
        const result = await sendNewsletterWithFallback(
            toEmails,
            subject,
            htmlContent,
            { forceSmtp: true, smtpAccount: 'account1' }
        );
        console.log("\n[결과] SMTP 발송 완료:", result);

        // 3. DB 확인
        console.log("\n[2] DB 내역 확인...");
        const latestLog = await prisma.emailSendLog.findFirst({
            orderBy: { id: 'desc' }
        });
        console.log("최신 EmailSendLog:", latestLog);

        if (latestLog) {
            const details = await prisma.emailSendDetail.findMany({
                where: { logId: latestLog.id }
            });
            console.log("관련 EmailSendDetail:", details);
        }
    } catch (error) {
        console.error("테스트 실패:", error);
    } finally {
        await prisma.$disconnect();
        console.log("=== 테스트 종료 ===");
    }
}

runTest();
