// ============================================================
// 실전노트 블로그 새 글 → 페이스북 4페이지 자동 게시 (cron)
// 블로그 유통 자동화 트랙 (2026-08-30)
// 정본 계획: chao-vn-app/PROGRESS_REVENUE_MASTERPLAN.md
// ============================================================
//
// 하루 3번(vercel.json) RSS 를 보고, 아직 안 올린 새 글만 게시한다.
// - 이미지가 없는 글은 건너뛴다 (Cloud Function 이 imageUrl 필수 — 사진 게시 방식)
// - 중복 방지: Firestore `blogFbPosted/{링크 md5}` 에 게시 기록을 남긴다.
//   cron 라우트는 저장소 관행상 인증이 없지만, 이 기록 덕에 누가 반복 호출해도
//   같은 글이 두 번 나가지 않는다.
// - 뉴스 자동 게시(fb-publish)와 달리 promos(협찬)는 붙이지 않는다 — 블로그는
//   독립 브랜드(실전노트)라 씬짜오 협찬이 실리면 정체가 섞인다.
// - 링크에 UTM 을 붙인다 (뉴스 쪽은 "안 붙이기로 한 결정"이 있지만 그건 기존
//   자동화를 안 건드리려는 결정이었고, 이 흐름은 새로 만드는 것이라 처음부터 붙인다).

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getFirestore } from '@/lib/firebase-admin';
import { fetchSiljeonnotePosts, withSiljeonnoteUtm } from '@/lib/siljeonnote';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const FB_FN_URL =
  'https://asia-northeast3-chaovietnam-login.cloudfunctions.net/publishToFacebookPage';

export async function GET() {
  const results = [];
  try {
    if (!process.env.PUBLISH_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'PUBLISH_API_KEY 환경변수가 없습니다' },
        { status: 500 },
      );
    }

    // 새 글 후보 — 최근 2일. cron 이 하루 3번 돌므로 이 창이면 놓치지 않는다.
    const posts = await fetchSiljeonnotePosts({ days: 2, max: 3 });
    if (!posts.length) {
      return NextResponse.json({ success: true, message: '새 글 없음', results });
    }

    const db = getFirestore();

    for (const p of posts) {
      const id = crypto.createHash('md5').update(p.link).digest('hex');
      const ref = db.collection('blogFbPosted').doc(id);

      if ((await ref.get()).exists) {
        results.push({ title: p.title, skipped: '이미 게시됨' });
        continue;
      }
      if (!p.imageUrl) {
        results.push({ title: p.title, skipped: '이미지 없음 — 사진 게시 불가' });
        continue;
      }

      const link = withSiljeonnoteUtm(p.link, { source: 'facebook', medium: 'social' });
      const caption =
        `📝 베트남 살이 실전노트 — 새 글\n${p.title}` +
        (p.summary ? `\n\n${p.summary}…` : '') +
        `\n\n전체 글 읽기 ↓`;

      const fbRes = await fetch(FB_FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + process.env.PUBLISH_API_KEY,
        },
        body: JSON.stringify({
          news: { imageUrl: p.imageUrl, caption, link },
          promos: [],
        }),
        signal: AbortSignal.timeout(290000),
      });
      const fbData = await fbRes.json().catch(() => ({}));

      if (fbData.ok) {
        // 기록을 남겨야 다음 cron 이 같은 글을 또 안 올린다
        await ref.set({
          title: p.title,
          link: p.link,
          permalink: fbData.permalink || '',
          postedAt: new Date().toISOString(),
          pageResults: fbData.pageResults || [],
        });
        results.push({ title: p.title, posted: true, permalink: fbData.permalink || '' });
      } else {
        // 실패는 기록하지 않는다 — 다음 cron 이 다시 시도한다
        results.push({ title: p.title, posted: false, error: fbData.error || `HTTP ${fbRes.status}` });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('[Cron fb-blog] 실패:', error);
    return NextResponse.json({ success: false, error: error.message, results }, { status: 500 });
  }
}
