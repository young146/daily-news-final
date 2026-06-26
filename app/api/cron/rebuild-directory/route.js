// [크론] 디렉토리 색인 갱신 — 진출기업(xcd) + 이웃업소(Firestore) + 관리자수정 재적용.
// 옐로 매거진/라이프플라자 기반은 로컬 JSON 이라 여기서 안 건드림(거의 고정).
import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma.js';
import { buildCompany, refreshNeighbor } from '../../../../lib/search-index-core.js';
import { reapplyAllEdits } from '../../../../lib/apply-directory-edits.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const t = Date.now();
  try {
    const company = await buildCompany(prisma);
    const neighbor = await refreshNeighbor(prisma);
    const edits = await reapplyAllEdits(prisma);
    return NextResponse.json({ ok: true, company, neighbor, edits, ms: Date.now() - t });
  } catch (e) {
    console.error('[cron/rebuild-directory]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
