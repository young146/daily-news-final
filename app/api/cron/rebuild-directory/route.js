// [크론] 디렉토리 색인 갱신 — 진출기업(xcd) + 옐로페이지(이웃업소+매거진/라이프플라자) + 관리자수정 재적용.
// 옐로 마스터 JSON 은 레포에 커밋되어 함께 배포 → 서버가 직접 읽어 자동 갱신.
import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma.js';
import { buildCompany, buildYellow } from '../../../../lib/search-index-core.js';
import { reapplyAllEdits } from '../../../../lib/apply-directory-edits.js';
import yellowMaster from '../../../../data/yellowpage_master.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET() {
  const t = Date.now();
  try {
    const company = await buildCompany(prisma);
    const yellow = await buildYellow(prisma, yellowMaster);
    const edits = await reapplyAllEdits(prisma);
    return NextResponse.json({ ok: true, company, yellow, edits, ms: Date.now() - t });
  } catch (e) {
    console.error('[cron/rebuild-directory]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
