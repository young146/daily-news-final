// 이웃업소 승인 즉시 색인 반영 — 관리자 '✅ 승인' 후 호출(또는 수동).
// Firestore 의 승인된 이웃업소를 색인에 즉시 반영 + 중복 옐로 제거.
// 인증 불필요: 권위 있는 Firestore(승인된 것만) 를 그대로 미러링할 뿐이라 악용 위험 없음.
import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma.js';
import { refreshNeighbor } from '../../../../lib/search-index-core.js';
import { reapplyAllEdits } from '../../../../lib/apply-directory-edits.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function run() {
  const t = Date.now();
  const neighbor = await refreshNeighbor(prisma);
  const edits = await reapplyAllEdits(prisma);
  return { ok: true, neighbor, edits, ms: Date.now() - t };
}

export async function POST() {
  try { return NextResponse.json(await run(), { headers: CORS }); }
  catch (e) { console.error('[refresh-neighbor]', e); return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS }); }
}
export async function GET() {
  try { return NextResponse.json(await run(), { headers: CORS }); }
  catch (e) { console.error('[refresh-neighbor]', e); return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS }); }
}
