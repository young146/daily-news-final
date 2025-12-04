
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { publishCardNewsToWordPress } from '@/lib/publisher';

export async function POST(request) {
    try {
        // Check if WordPress publish is requested
        const body = await request.json().catch(() => ({}));
        const publishToWP = body.publishToWordPress || false;
        
        // 1. Launch a hidden browser (Puppeteer)
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(90000);
        page.setDefaultTimeout(90000);

        // 2. Set viewport to match our card size (Landscape)
        await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });

        // 3. Navigate to the Clean Print Page
        const targetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/print/card-news`;
        console.log(`Puppeteer visiting: ${targetUrl}`);

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('#capture-target', { timeout: 90000 });
        
        // Wait a bit for images to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 4. Generate PNG (for SNS and WordPress)
        const pngBuffer = await page.screenshot({
            type: 'png',
            clip: { x: 0, y: 0, width: 1200, height: 630 }
        });

        // 5. Generate PDF
        const pdfBuffer = await page.pdf({
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 }
        });

        await browser.close();

        // 6. Save to server (public folder)
        const date = new Date().toISOString().split('T')[0];
        const pdfPath = path.join(process.cwd(), 'public', `daily-news-${date}.pdf`);
        const pngPath = path.join(process.cwd(), 'public', `daily-news-${date}.png`);

        fs.writeFileSync(pdfPath, pdfBuffer);
        fs.writeFileSync(pngPath, pngBuffer);

        console.log('Files generated successfully:', pdfPath, pngPath);

        let wordpressResult = null;

        // 7. Publish to WordPress if requested
        if (publishToWP) {
            console.log('[CardNews] Publishing to WordPress...');
            
            // Get the top news for context
            const topNews = await prisma.newsItem.findFirst({
                where: { isTopNews: true },
                select: { translatedTitle: true, title: true }
            });
            
            try {
                wordpressResult = await publishCardNewsToWordPress(pngBuffer, date, {
                    topNewsTitle: topNews?.translatedTitle || topNews?.title,
                    dailyNewsUrl: 'https://chaovietnam.co.kr/category/news/dailynews/'
                });
                console.log('[CardNews] WordPress publish success:', wordpressResult);
            } catch (wpError) {
                console.error('[CardNews] WordPress publish failed:', wpError.message);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            pdfUrl: `/daily-news-${date}.pdf`,
            pngUrl: `/daily-news-${date}.png`,
            wordpress: wordpressResult
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Auto-generation failed:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }
}
