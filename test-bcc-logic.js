import * as dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { sendNewsletterBatchedBccSmtp } from './lib/email-service.js';

dotenv.config();

let accountAssignments = [];

// Mock nodemailer
nodemailer.createTransport = function(options) {
    return {
        verify: async () => true,
        close: () => {},
        sendMail: async (mailOptions) => {
            accountAssignments.push({
                account: options.auth.user,
                bccCount: mailOptions.bcc.length
            });
            return { messageId: 'mock-id' };
        }
    };
};

async function runTest() {
    console.log("=== STARTING BCC DRY-RUN TEST ===");
    const dummies = Array.from({ length: 3492 }, (_, i) => `test${i}@example.com`);
    
    try {
        const result = await sendNewsletterBatchedBccSmtp(
            dummies,
            "Mock Subject",
            "<h1>Mock Body</h1>"
        );
        
        console.log("\n=== BATCH ASSIGNMENTS ===");
        accountAssignments.forEach((assignment, i) => {
            console.log(`Batch ${i+1}: ${assignment.bccCount} emails sent via ${assignment.account}`);
        });
        
        console.log("\n=== TEST RESULT ===");
        console.log(result);
    } catch (err) {
        console.error("Test failed:", err);
    }
}

runTest();
