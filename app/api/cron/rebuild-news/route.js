// [크론] 뉴스 색인 갱신 — WP 데일리뉴스(cat 31) 전량 재색인.
import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma.js';
import { buildNews } from '../../../../lib/search-index-core.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const t = Date.now();
  try {
    const news = await buildNews(prisma, 0);
    return NextResponse.json({ ok: true, news, ms: Date.now() - t });
  } catch (e) {
    console.error('[cron/rebuild-news]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
