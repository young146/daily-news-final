import { NextResponse } from 'next/server';
import { runCrawlerService } from '@/lib/crawler-service';

export const dynamic = 'force-dynamic'; // Prevent caching
export const maxDuration = 300; // Allow it to run for up to 5 minutes (Vercel Pro/Hobby limits apply)

export async function GET(request) {
    // Check for specialized Vercel Cron header to ensure it's triggered by Vercel
    // or allow manual trigger with a secret key if needed.
    // For now, we allow it to run to ensure the Cron works.

    console.log('[Cron] Crawler triggered');

    try {
        const result = await runCrawlerService();
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        console.error('[Cron] Crawler failed:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
