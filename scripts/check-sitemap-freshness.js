// =============================================================================
//  사이트맵 최신성 감시 (읽기 전용)
// =============================================================================
//  목적: 매일 자동으로 "WP 최신 발행글"과 "사이트맵 최신 글"을 비교해,
//        ① 사이트맵 freeze(2026-06-15 사례) ② 발행 중단 을 조기 포착한다.
//  특징: GET 요청만 사용 → 보안(Wordfence)에 안 걸림. 쓰기·수정 전혀 안 함.
//  실패(exit 1) 시 GitHub Actions 가 저장소 소유자에게 자동 이메일을 보냄.
//
//  기준(UTC): 사이트맵 lastmod 는 UTC(+00:00), WP 는 date_gmt(UTC) 를 사용해 정확히 비교.
// =============================================================================

const WP = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';

async function main() {
  // 1) WP 실제 최신 발행글 (인증 불필요 — 공개 발행글)
  const r = await fetch(`${WP}/wp-json/wp/v2/posts?per_page=1&_fields=id,date_gmt,link`);
  if (!r.ok) throw new Error(`WP REST 조회 실패: HTTP ${r.status}`);
  const posts = await r.json();
  const newest = posts[0];
  if (!newest) throw new Error('WP 응답에 글이 없음');
  const wpNewest = new Date(newest.date_gmt + 'Z');

  // 2) 사이트맵 최신 글 (post-sitemap1 = 최신맵). 캐시버스팅으로 항상 실시간 조회.
  const rs = await fetch(`${WP}/post-sitemap1.xml?ck=${Date.now()}`, {
    headers: { 'User-Agent': 'sitemap-freshness-monitor' },
  });
  if (!rs.ok) throw new Error(`사이트맵 조회 실패: HTTP ${rs.status}`);
  const xml = await rs.text();
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)]
    .map((m) => new Date(m[1]))
    .sort((a, b) => b - a);
  const ids = [...xml.matchAll(/\/(\d+)\//g)].map((m) => +m[1]).sort((a, b) => b - a);
  if (!lastmods.length) throw new Error('사이트맵에서 lastmod 를 못 읽음');
  const sitemapNewest = lastmods[0];

  const now = new Date();
  const pubAgeH = (now - wpNewest) / 36e5; // 최신 글이 몇 시간 전인지
  const lagH = (wpNewest - sitemapNewest) / 36e5; // 사이트맵이 얼마나 뒤처졌는지

  console.log(`WP 최신 발행글:  #${newest.id}  ${newest.date_gmt} UTC`);
  console.log(`사이트맵 최신글: #${ids[0]}  ${sitemapNewest.toISOString()}`);
  console.log(`발행 경과: ${pubAgeH.toFixed(1)}h   사이트맵 지연: ${lagH.toFixed(1)}h`);

  const problems = [];
  // 매일 발행되므로 최신 글이 36시간 넘게 없으면 발행 파이프라인 이상
  if (pubAgeH > 36) {
    problems.push(`발행 중단 의심: 최신 글이 ${pubAgeH.toFixed(0)}시간 전입니다(매일 발행돼야 정상).`);
  }
  // 매일 발행되므로 사이트맵이 24시간 넘게 뒤처지면 freeze
  if (lagH > 24) {
    problems.push(`사이트맵 freeze 의심: 사이트맵이 최신 글보다 ${lagH.toFixed(0)}시간 뒤처졌습니다. mu-plugin(캐시끄기) 확인 필요.`);
  }

  if (problems.length) {
    console.error('\n❌ 이상 감지:');
    problems.forEach((p) => console.error('  - ' + p));
    process.exit(1); // → GitHub Actions 실패 → 소유자에게 자동 이메일
  }
  console.log('\n✅ 정상: 발행·사이트맵 모두 최신 유지 중');
}

main().catch((e) => {
  console.error('❌ 감시 실행 실패:', e.message);
  process.exit(1);
});
