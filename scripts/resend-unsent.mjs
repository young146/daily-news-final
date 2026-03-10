/**
 * resend-unsent.mjs
 * unsent-list.json에 저장된 미발송 구독자에게
 * younghan146@gmail.com 계정으로만 이메일을 재발송합니다.
 *
 * 실행: node scripts/resend-unsent.mjs
 * (선택) 특정 뉴스 ID 지정: node scripts/resend-unsent.mjs <publishedNewsId>
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import nodemailer from 'nodemailer';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env'), override: false });

const prisma = new PrismaClient();
const BATCH_SIZE = 100;   // BCC 100명씩
const DELAY_MS = 1500;  // 배치 간 1.5초 대기

async function main() {
    // ── 1. 미발송 목록 읽기 ──────────────────────────────
    const unsentPath = resolve(process.cwd(), 'unsent-list.json');
    let toEmails;
    try {
        toEmails = JSON.parse(readFileSync(unsentPath, 'utf8'));
    } catch {
        console.error('❌ unsent-list.json 파일이 없습니다. 먼저 find-unsent.mjs를 실행하세요.');
        process.exit(1);
    }
    console.log(`📋 미발송 대상: ${toEmails.length}명`);

    // ── 2. 오늘 발송한 뉴스 HTML 가져오기 ─────────────────
    const newsId = process.argv[2] ? process.argv[2] : null;
    const news = newsId
        ? await prisma.newsItem.findUnique({ where: { id: newsId }, select: { title: true, htmlContent: true } })
        : await prisma.newsItem.findFirst({
            where: { htmlContent: { not: null }, isPublishedDaily: true },
            orderBy: { publishedAt: 'desc' },
            select: { id: true, title: true, htmlContent: true }
        });

    if (!news?.htmlContent) {
        console.error('❌ 뉴스 HTML을 찾을 수 없습니다. DB를 확인하세요.');
        await prisma.$disconnect();
        process.exit(1);
    }
    console.log(`📰 발송 뉴스: ${news.title}`);
    console.log(`📄 HTML 크기: ${news.htmlContent.length.toLocaleString()} bytes`);

    // ── 3. 두 번째 Gmail 계정 transporter 생성 ───────────
    if (!process.env.SMTP_USER2 || !process.env.SMTP_PASS2) {
        console.error('❌ SMTP_USER2, SMTP_PASS2 환경변수가 없습니다.');
        await prisma.$disconnect();
        process.exit(1);
    }

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: process.env.SMTP_USER2, pass: process.env.SMTP_PASS2 },
    });

    await transporter.verify();
    console.log(`\n✅ ${process.env.SMTP_USER2} 연결 확인`);

    // ── 4. 100명씩 BCC 배치 발송 ─────────────────────────
    const batches = [];
    for (let i = 0; i < toEmails.length; i += BATCH_SIZE) {
        batches.push(toEmails.slice(i, i + BATCH_SIZE));
    }

    console.log(`\n🚀 발송 시작: ${batches.length}개 배치 × 최대 ${BATCH_SIZE}명\n`);
    let succeeded = 0, failed = 0;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
            await transporter.sendMail({
                from: `"씬짜오베트남 데일리뉴스" <${process.env.SMTP_USER2}>`,
                to: process.env.SMTP_USER2,
                bcc: batch,
                subject: news.title,
                html: news.htmlContent,
            });
            succeeded += batch.length;
            console.log(`  ✅ 배치 ${i + 1}/${batches.length}: ${batch.length}명 성공 (누적 ${succeeded}명)`);
            if (i < batches.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
        } catch (err) {
            failed += batch.length;
            console.error(`  ❌ 배치 ${i + 1}/${batches.length} 실패:`, err.message);
        }
    }

    console.log(`\n========================================`);
    console.log(`🎉 발송 완료!`);
    console.log(`   성공: ${succeeded}명 | 실패: ${failed}명`);
    console.log(`========================================`);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
