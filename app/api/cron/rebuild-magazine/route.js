// [크론] 매거진 색인 "증분" 갱신 — 최근 14일 내 작성·수정된 글만 upsert.
// (전량 재색인은 본문 포함 시 7000여건·약 6분이라 300초 크론 제한 초과 → CLI로 가끔 수동 실행:
//  node scripts/build-search-index.js magazine)
import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma.js';
import { buildMagazineRecent } from '../../../../lib/search-index-core.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const t = Date.now();
  try {
    const magazine = await buildMagazineRecent(prisma, 14);
    return NextResponse.json({ ok: true, magazine, ms: Date.now() - t });
  } catch (e) {
    console.error('[cron/rebuild-magazine]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
