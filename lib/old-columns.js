// ============================================================
// 「그때 그 칼럼」 — chaovietnam.co.kr 에 묻힌 20년 칼럼 발굴 코너
// (2026-08-30, 사장님 지시: "사이트에 묻혀 있는 것보다 살리는 게 낫다")
// ============================================================
//
// 왜 블로그로 옮기지 않고 여기서 발굴하나:
//   같은 글이 두 사이트에 있으면 구글이 한쪽을 검색에서 지우고(중복 콘텐츠),
//   애드센스 심사에서 "긁어온 사이트"로 보인다. 원본이 있는 본진(chaovietnam)으로
//   보내는 것이 정답 — 본진엔 이미 애드센스가 붙어 있어 옛 글이 바로 수익을 낸다.
//
// 대상 카테고리 (사장님 본인 칼럼 — 2026-08-30 실측 조사):
//   396 Han Column(371편) · 34 중언부언 컬럼(126) · 382 CHAO COLUMN(108)
//   · 342 Golf 칼럼(86) · 389 짜오칼럼(12)
//   ※ 글이 여러 카테고리에 겹쳐 있어도 offset 방식이라 문제 없다.
//
// 회전 방식: 날짜 기반 결정적(deterministic) — 하루에 한 편, 매일 다른 글.
//   (dayIndex * 37) % 전체글수 → 37은 전체와 서로소인 걸음폭이라
//   연대를 건너뛰며 골고루 순환한다. 랜덤이 아니라서 재실행해도 같은 글.

const WP_BASE = 'https://chaovietnam.co.kr/wp-json/wp/v2';
const COLUMN_CATS = '396,34,382,342,389';

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#39;|&apos;|&#8217;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * 오늘의 옛 칼럼 1편. 실패 시 throw — 호출자가 try/catch 로 코너 생략(레포 규약).
 * @returns { title, link, excerpt, imageUrl, year, dateStr }
 */
export async function fetchOldColumn({ timeoutMs = 8000 } = {}) {
  // 1) 전체 편수 — 응답 헤더 X-WP-Total (본문은 버린다)
  const head = await fetch(
    `${WP_BASE}/posts?categories=${COLUMN_CATS}&per_page=1&_fields=id`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!head.ok) throw new Error(`WP HTTP ${head.status}`);
  const total = parseInt(head.headers.get('x-wp-total') || '0', 10);
  if (!total) throw new Error('칼럼 글 수 0');

  // 2) 날짜 기반 회전 — 베트남 날짜 기준 하루 한 편
  const dayIndex = Math.floor((Date.now() + 7 * 3600 * 1000) / 86400000);
  const offset = (dayIndex * 37) % total;

  const res = await fetch(
    `${WP_BASE}/posts?categories=${COLUMN_CATS}&per_page=1&offset=${offset}` +
      `&orderby=date&order=asc&_embed=wp:featuredmedia`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!res.ok) throw new Error(`WP HTTP ${res.status}`);
  const [post] = await res.json();
  if (!post) throw new Error('칼럼 조회 결과 없음');

  const title = decodeEntities(post.title?.rendered);
  const excerpt = decodeEntities((post.excerpt?.rendered || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const imageUrl =
    post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  const d = new Date(post.date);

  return {
    title,
    link: post.link,
    excerpt,
    imageUrl,
    year: d.getFullYear(),
    dateStr: `${d.getFullYear()}년 ${d.getMonth() + 1}월`,
  };
}
