// ============================================================
// 「베트남 살이 실전노트」(vietnamsari.com) 최신 글 가져오기
// 블로그 유통 자동화 트랙 (2026-08-30)
// 정본 계획: chao-vn-app/PROGRESS_REVENUE_MASTERPLAN.md
// ============================================================
//
// 글 생산은 xinchao-blog-assistant 가 자동화했는데, 발행 후 아무 채널에도
// 자동으로 실리지 않았다. 이 모듈이 Blogger RSS 를 읽어 뉴스레터·카톡·페북이
// 같은 데이터를 쓰게 한다.
//
// RSS 파싱은 의존성 없이 정규식으로 한다 — send-daily-email 의 구글 트렌드
// RSS 와 같은 관행 (xml2js 등 미설치, 서버리스에서 가볍게).
//
// ⚠️ vietnamsari.com 은 UTM 화이트리스트(email-service/kakao-broadcast)에
//    넣지 않는다 — 그 목록은 GA4 채널 규칙과 얽혀 있어 건드리지 않는다.
//    대신 이 모듈의 withSiljeonnoteUtm() 으로 직접 붙인다.

const FEED_URL =
  'https://www.vietnamsari.com/feeds/posts/default?alt=rss&max-results=6';

/** RSS 안의 흔한 엔티티만 되돌린다 (제목·요약 표시용) */
function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function pickTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
}

/**
 * 최근 발행 글 목록.
 * @returns [{ title, link, summary, imageUrl, pubDate }] — 실패 시 throw
 *          (호출자가 try/catch 로 섹션 생략 — 이 저장소의 fail-safe 규약)
 */
export async function fetchSiljeonnotePosts({ days = 4, max = 2, timeoutMs = 7000 } = {}) {
  const res = await fetch(FEED_URL, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const posts = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    // ⚠️ Blogger 가 커스텀 도메인 연결 직후부터 링크를 `https:///2026/...` 처럼
    //    도메인 없이 내보내는 버그가 있다 (2026-08-20 사이트맵에서도 확인, 아직 지속).
    //    도메인을 우리가 되박는다.
    const link = decodeEntities(pickTag(b, 'link'))
      .replace(/^(https?):\/\/\//, '$1://www.vietnamsari.com/');
    const title = decodeEntities(pickTag(b, 'title'));
    const pubDate = new Date(pickTag(b, 'pubDate'));
    if (!link || !title || isNaN(pubDate)) continue;
    if (pubDate.getTime() < cutoff) continue;

    // 본문(description)은 HTML — 요약은 태그를 벗기고 앞부분만
    const descHtml = decodeEntities(pickTag(b, 'description'));
    const summary = descHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 110);

    // 그림: media:thumbnail(축소판 → 큰 판으로 주소 치환), 없으면 본문 첫 <img>
    let imageUrl = (b.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1] || '';
    imageUrl = imageUrl.replace(/\/s72(-c)?(-[a-z]+)*\//, '/s1600/');
    if (!imageUrl) {
      imageUrl = (descHtml.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
    }

    posts.push({ title, link, summary, imageUrl, pubDate });
    if (posts.length >= max) break;   // RSS 는 최신순
  }
  return posts;
}

/** 실전노트 링크에 채널별 UTM 부착 (기존 utm_* 이 있으면 존중) */
export function withSiljeonnoteUtm(rawUrl, { source, medium, campaign = 'siljeonnote' }) {
  try {
    const u = new URL(rawUrl);
    if (!/(^|\.)vietnamsari\.com$/.test(u.hostname)) return rawUrl;
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', source);
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', medium);
    if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  } catch (_) {
    return rawUrl;
  }
}
