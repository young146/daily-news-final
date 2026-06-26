// [크론] 매거진 색인 갱신 — WP posts(데일리뉴스 제외) 전량 재색인.
import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma.js';
import { buildMagazine } from '../../../../lib/search-index-core.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const t = Date.now();
  try {
    const magazine = await buildMagazine(prisma, 0);
    return NextResponse.json({ ok: true, magazine, ms: Date.now() - t });
  } catch (e) {
    console.error('[cron/rebuild-magazine]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
