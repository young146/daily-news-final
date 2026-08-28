/**
 * 배달 실패 진단 — SendGrid 차단 목록과 우리 명부를 맞대어 본다.
 * =====================================================================
 * 왜 필요한가 (2026-08-28):
 *   SendGrid 화면상 **배달률이 80.57%** 였다. 6일간 43,293건을 보내 34,883건만
 *   도착했다 — 8,410건이 사라졌다. 그런데 반송(bounce)은 7건뿐이었다.
 *   나머지는 전부 **차단(block)** 이다. 매일 1,400통이 조용히 버려지고 있었다.
 *
 * 이게 왜 중대한가:
 *   1. 죽은 주소로 계속 두드리면 **발송 도메인 평판이 깎인다.** 그 대가는 죽은
 *      주소가 아니라 **멀쩡한 나머지 7천 명이 치른다** (스팸함으로 밀린다).
 *   2. 다른 서비스(Kit 등)로 옮길 때 이 명부를 그대로 들고 가면 초반 반송률이
 *      튀어 **계정이 정지될 수 있다.** 옮기기 전에 반드시 치워야 한다.
 *
 * 하는 일: 차단 목록을 전부 받아 사유별로 나누고, 그중 **우리 명부에 아직
 *   활성으로 남아 있는 주소**가 몇 개인지 센다. 세기만 하고 **아무것도 지우지
 *   않는다** — 지우는 것은 사람이 보고 결정할 일이다.
 *
 * 쓰는 법: node scripts/audit-sendgrid-blocks.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const KEY = process.env.SENDGRID_API_KEY;
if (!KEY) {
  console.error('SENDGRID_API_KEY 가 없다.');
  process.exit(1);
}

/** 차단·반송 목록을 끝까지 받아 온다 (한 번에 500건씩) */
async function fetchAll(endpoint) {
  const out = [];
  for (let offset = 0; offset < 60000; offset += 500) {
    const res = await fetch(
      `https://api.sendgrid.com/v3/suppression/${endpoint}?limit=500&offset=${offset}`,
      { headers: { Authorization: `Bearer ${KEY}` } },
    );
    if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

/**
 * 사유를 세 갈래로 나눈다. **지워도 되는 것과 기다려야 하는 것을 섞으면 안 된다.**
 *   dead  = 받는 곳이 아예 없다 (도메인·계정 없음). 명부에서 빼는 게 맞다.
 *   temp  = 지금만 안 되는 것 (사서함 꽉 참, 시간 초과). 기다리면 된다.
 *   spam  = 내용·평판 때문에 거부당한 것. **우리 문제라 우리가 고쳐야 한다.**
 */
function classify(reason = '') {
  const r = reason.toLowerCase();
  if (r.includes('unable to get mx') || r.includes('no such') || r.includes('does not exist') ||
      r.includes('unrouteable') || r.includes('user unknown') || r.includes('invalid recipient') ||
      r.includes('recipient address rejected') || r.includes('domain not found')) return 'dead';
  if (r.includes('spam') || r.includes('blocked') || r.includes('blacklist') ||
      r.includes('spamcop') || r.includes('reputation') || r.includes('policy')) return 'spam';
  return 'temp';
}

async function main() {
  console.log('SendGrid 차단·반송 목록을 받는 중…');
  const [blocks, bounces] = await Promise.all([fetchAll('blocks'), fetchAll('bounces')]);
  console.log(`차단 ${blocks.length.toLocaleString()}건 · 반송 ${bounces.length.toLocaleString()}건`);

  // 같은 주소가 날마다 다시 기록되므로, 주소 단위로 접는다
  const byEmail = new Map();
  for (const b of [...blocks, ...bounces]) {
    const email = (b.email || '').trim().toLowerCase();
    if (!email) continue;
    const kind = classify(b.reason);
    const prev = byEmail.get(email);
    // 한 주소가 여러 사유로 걸렸으면 무거운 쪽(dead > spam > temp)을 남긴다
    const rank = { dead: 3, spam: 2, temp: 1 };
    if (!prev || rank[kind] > rank[prev.kind]) {
      byEmail.set(email, { kind, reason: b.reason || '' });
    }
  }
  console.log(`중복을 접으면 실제 주소 ${byEmail.size.toLocaleString()}개`);

  const prisma = new PrismaClient();
  const active = await prisma.subscriber.findMany({
    where: { isActive: true },
    select: { email: true },
  });
  await prisma.$disconnect();

  const activeSet = new Set(active.map((s) => s.email.toLowerCase()));
  const hit = { dead: [], spam: [], temp: [] };
  for (const [email, info] of byEmail) {
    if (activeSet.has(email)) hit[info.kind].push({ email, reason: info.reason });
  }

  const total = hit.dead.length + hit.spam.length + hit.temp.length;
  console.log('');
  console.log('─'.repeat(58));
  console.log(`활성 명부 ${activeSet.size.toLocaleString()}명 중 **${total.toLocaleString()}명**이 차단 목록에 있다`);
  console.log('─'.repeat(58));
  console.log(`  받는 곳이 없음 (빼야 함)   ${hit.dead.length.toLocaleString()}명`);
  console.log(`  스팸·평판으로 거부         ${hit.spam.length.toLocaleString()}명`);
  console.log(`  일시적 (기다리면 됨)       ${hit.temp.length.toLocaleString()}명`);
  const pct = ((total / activeSet.size) * 100).toFixed(1);
  console.log(`  → 매일 보내는 메일의 약 ${pct}% 가 헛걸음이다`);

  const outDir = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'blocked-subscribers.json');
  fs.writeFileSync(outFile, JSON.stringify(hit, null, 2), 'utf-8');
  console.log('');
  console.log(`자세한 목록: ${outFile}`);
  console.log('※ 이 스크립트는 세기만 한다. 아무것도 지우지 않았다.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
