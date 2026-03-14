import * as dotenv from 'dotenv';
import { sendNewsletterBatchedBccSmtp } from './lib/email-service.js';

dotenv.config();

async function runTest() {
    console.log("=== STARTING LIVE BCC TEST ===");
    
    // We send only to the admin TEST_EMAIL
    const dummies = [process.env.TEST_EMAIL || 'younghan146@gmail.com'];
    
    try {
        const result = await sendNewsletterBatchedBccSmtp(
            dummies,
            "[테스트] BCC 통합 발송 테스트",
            "<h1>BCC 발송 테스트</h1><p>이 메일이 정상적으로 도착했다면 BCC 통합 발송과 호환되는 환경 전환(Node/Nodemailer)이 성공적인 것입니다.</p>"
        );
        
        console.log("=== TEST RESULT ===");
        console.log(result);
    } catch (err) {
        console.error("Test failed:", err);
    }
}

runTest();
