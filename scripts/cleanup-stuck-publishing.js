/**
 * 일회성 cleanup script
 *
 * 배경:
 *   2026-05-24 atomic claim 패턴 도입 직후 publisher.js의 기존 가드와 충돌해서,
 *   DB의 wordpressUrl에 sentinel '__PUBLISHING__'이 박힌 채 status='PUBLISHED' 가 된
 *   row들이 생겼다. 실제 WordPress에는 article이 없는 좀비 상태.
 *
 * 동작:
 *   wordpressUrl='__PUBLISHING__' 인 row들을 발행 전 상태로 되돌린다.
 *   - wordpressUrl: null
 *   - status: 'DRAFT'
 *   - isPublishedMain/Daily: false
 *   - publishedAt: null
 *   - isSelected: true   (Top News 목록에 다시 표시되어 재발행 가능)
 *
 * 실행: node scripts/cleanup-stuck-publishing.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SENTINEL = '__PUBLISHING__';

async function main() {
  console.log(`[Cleanup] Looking for rows with wordpressUrl='${SENTINEL}'...`);

  const stuck = await prisma.newsItem.findMany({
    where: { wordpressUrl: SENTINEL },
    select: { id: true, title: true, translatedTitle: true, status: true, isSelected: true },
  });

  if (stuck.length === 0) {
    console.log('[Cleanup] ✅ No stuck rows found. Nothing to do.');
    return;
  }

  console.log(`[Cleanup] Found ${stuck.length} stuck row(s):`);
  stuck.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.id.slice(0, 8)}...] ${r.translatedTitle || r.title}`);
  });

  console.log('\n[Cleanup] Resetting these rows to pre-publish state...');

  const result = await prisma.newsItem.updateMany({
    where: { wordpressUrl: SENTINEL },
    data: {
      wordpressUrl: null,
      status: 'DRAFT',
      isPublishedMain: false,
      isPublishedDaily: false,
      publishedAt: null,
      isSelected: true,
    },
  });

  console.log(`[Cleanup] ✅ Reset ${result.count} row(s). They will reappear in the Top News list for re-publishing.`);
}

main()
  .catch((e) => {
    console.error('[Cleanup] ❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
