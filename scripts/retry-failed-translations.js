// ════════════════════════════════════════════════════════════════
// 번역 실패분 일괄 재번역 (Retry failed translations)
// ────────────────────────────────────────────────────────────────
// 무엇: DRAFT 상태인데 본문/제목이 "Translation Failed"로 저장돼 눌러앉은
//       항목들을 찾아 강화된 번역엔진으로 다시 번역한다.
//       성공 → 정상 DRAFT / 또 실패 → PENDING(다음에 또 시도 가능)
// 언제: 실패가 쌓였다 싶을 때 아무 때나 `npm run retry-failed`
// 안전: 순차 처리(0.5초 간격)라 rate limit 안 남. 실패분만 손댐(다른 데이터 무관).
//
// 필요 env: ANTHROPIC_API_KEY, DATABASE_URL
//   - 없으면 dev-secrets/.env 에서 자동 보충 시도(사장님 PC 기준)
// ════════════════════════════════════════════════════════════════
require('dotenv').config();

// 키가 비면 dev-secrets 에서 보충 (override 없이 빈 값만 채움)
if (!process.env.ANTHROPIC_API_KEY || !process.env.DATABASE_URL) {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const secret = process.env.SECRETS_ENV
    || path.join(os.homedir(), 'OneDrive', 'dev-secrets', 'daily-news-final', '.env');
  if (fs.existsSync(secret)) {
    require('dotenv').config({ path: secret });
    console.log(`[retry] 보조 환경변수 로드: ${secret}`);
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAIL = { contains: 'Translation Failed' };
const FAIL_KO = { contains: '번역 실패' };

async function main() {
  if (!process.env.ANTHROPIC_API_KEY || !process.env.DATABASE_URL) {
    console.error('[retry] ⚠️ ANTHROPIC_API_KEY / DATABASE_URL 이 없습니다. 중단합니다.');
    process.exit(1);
  }

  const translator = await import('../lib/translator.js');

  // 재검수 큐(DRAFT)에 눌러앉은 실패분만 대상으로
  const targets = await prisma.newsItem.findMany({
    where: {
      translationStatus: 'DRAFT',
      OR: [
        { translatedTitle: FAIL }, { translatedContent: FAIL },
        { translatedTitle: FAIL_KO }, { translatedContent: FAIL_KO },
      ],
    },
    select: { id: true, title: true, summary: true, content: true, category: true, source: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`[retry] 대상 ${targets.length}건`);
  if (targets.length === 0) { await prisma.$disconnect(); return; }

  let healed = 0, stillFailed = 0, noSource = 0;
  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const src = item.content || item.summary;
    if (!src) {
      // 원문이 없어 번역 불가 → PENDING 으로 빼서 큐에서 치움(수동 확인 대상)
      await prisma.newsItem.update({ where: { id: item.id }, data: { translationStatus: 'PENDING' } });
      noSource++;
      console.warn(`  [${i + 1}/${targets.length}] ⚠️ 원문없음 → PENDING: ${(item.title || '').slice(0, 40)}`);
      continue;
    }

    const r = await translator.translateFullArticle(item.title, item.summary, src, item.category);
    if (translator.isFailedTranslation(r)) {
      await prisma.newsItem.update({ where: { id: item.id }, data: { translationStatus: 'PENDING' } });
      stillFailed++;
      console.warn(`  [${i + 1}/${targets.length}] ❌ 또 실패 → PENDING: ${(item.title || '').slice(0, 40)} (${r.error || ''})`);
    } else {
      await prisma.newsItem.update({
        where: { id: item.id },
        data: {
          translatedTitle: r.translatedTitle,
          translatedSummary: r.translatedSummary,
          translatedContent: r.translatedContent,
          translationStatus: 'DRAFT',
        },
      });
      healed++;
      console.log(`  [${i + 1}/${targets.length}] ✅ 복구: ${(r.translatedTitle || '').slice(0, 40)}`);
    }
    await sleep(500); // rate limit 여유
  }

  console.log(`\n[retry] 완료 — 복구 ${healed} / 재실패(PENDING) ${stillFailed} / 원문없음(PENDING) ${noSource}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('[retry] 오류:', e.message);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
