<?php
/**
 * Plugin Name: XinChao 통합 광고 (Unified Ads)
 * Description: 통합 광고센터(ads_unified)의 chaovietnam 지면 광고를 공개 API로 불러와 표시한다. 기사 본문에 위치별 자동 삽입 — 상단(1) + 중간(2) + 하단(1). 사이드바는 [xinchao_ad slot="sidebar"] 숏코드. Advanced Ads/Ad Inserter 불필요. 직원은 통합센터에서 등록만 하면 되고, 위치는 우선순위로 자동 결정.
 * Version: 4.8.2
 * Author: XinChao
 *
 * ── 변경 이력 ──
 *   4.8.2 (2026-09-03) 가운데 자리를 '50% 에 가장 가까운 단락 경계'로. 앞에 큰 위젯이
 *                      박힌 글(환율계산기)은 후보를 못 찾아 하단과 붙었다.
 *   4.8.1 (2026-09-03) 가운데 CTA 위치를 단락 '개수'가 아니라 '글자 수'로 계산.
 *                      소제목·표가 많은 글에서 가운데가 끝자락에 떨어져 하단과 붙었다.
 *   4.8.0 (2026-09-03) CTA 를 **세 자리로 분산**(사장님 지시: 맨 아래 뭉치면 효과 없다).
 *                      제목 아래=이메일 구독 / 본문 한가운데=앱 설치 / 맨 아래=디지털 라인.
 *                      + house_digital(씬짜오베트남 디지털 라인) 소재 추가.
 *   4.7.3 (2026-09-03) 서버 렌더끼리도 안 겹치게 — 뉴스 터미널은 house_app 을 일부러
 *                      서버에서 그리는데 본문 끝 띠가 또 그렸다. 그린 소재를 기록해 피한다.
 *   4.7.2 (2026-09-03) 자체 홍보 폴백이 **본문 끝 띠와 같은 소재를 또 그리던 것**을 고침.
 *                      (뉴스 터미널에서 「씬짜오 앱 설치」가 두 번 떴다.)
 *                      폴백이 DOM 을 보고 이미 나온 소재를 건너뛴다 + JS 배너에도
 *                      data-xc-house 표식을 달아 슬롯끼리도 안 겹치게 했다.
 *   4.7.1 (2026-09-03) 위 4.7.0 에서 **구독 권유를 새로 만든 것이 잘못**이었다.
 *                      jenny-daily-news.php 에 이미 사이트 안에서 접수되는 폼이 있었고,
 *                      데일리뉴스 목록·기사에서 구독 권유가 두 번 나왔다(실측).
 *                      → 내가 만든 구독 버튼과 house_newsletter 소재를 걷어내고,
 *                        기존 jenny_subscribe_box() 를 불러 쓴다(스스로 중복을 막는다).
 *                        본문 끝 띠는 이제 **앱 설치**만 담당한다.
 *   4.7.0 (2026-09-03) 앱 설치·이메일 구독 안내를 **모든 글·페이지 끝에 항상** 붙인다.
 *                      자체 홍보(house)는 폴백이라 광고가 팔린 페이지에서는 사라졌다 —
 *                      광고가 잘 팔릴수록 깔때기 입구가 없어지는 거꾸로 된 구조였다.
 *                      + 자체 홍보 소재에 빠져 있던 house_newsletter(이메일 구독) 추가.
 *   4.6.1 (2026-08-23) 위 4.6.0 이 실제로는 동작하지 않았다 — 위젯 안에 슬롯 스크립트가
 *                      있어서 textContent 가 '자바스크립트 소스'까지 글자로 세는 바람에
 *                      '비어 있음' 판정이 영영 참이 되지 않았다. 사본에서 script/style 을
 *                      떼고 판정하도록 고침.
 *   4.6.0 (2026-08-23) 빈 슬롯이 위젯 껍데기만 남기지 않게 함.
 *                      사이드바에 슬롯 창구를 자리마다 두면, 광고 없는 칸은 슬롯만 숨고
 *                      위젯 상자와 그 바깥 여백이 남아 사이드바에 빈 틈이 줄줄이 생겼다.
 *                      슬롯이 그 위젯의 유일한 내용일 때만 위젯째 숨긴다(제목·다른 내용이
 *                      있으면 건드리지 않는다).
 *   4.5.0 (2026-08-23) 슬롯 진단 모드. 주소 끝에 ?xcads=debug 를 붙이면 빈 슬롯도
 *                      이름표를 단 점선 상자로 보인다(?xcads=off 로 끔).
 *                      켠 상태는 sessionStorage 에 남아 페이지를 옮겨도 유지된다.
 *                      독자에게는 아무 영향이 없다 — 켠 사람 브라우저에서만 보인다.
 *   4.4.0 (2026-08-23) 슬롯 표준 적용 (chao-vn-app 저장소의 PROGRESS_AD_SLOTS.md §8-3)
 *                      · 컨테이너 클래스 xinchao-ad → xc-slot  (ad/banner/e3lan 은 광고차단 필터에 걸린다)
 *                      · 현재 페이지 자동 판정 → 사이드바가 더 이상 페이지를 섞지 않는다
 *                      · 본문 중간: 매 2단락(최대 6칸) → 본문 3등분 2칸
 *                      · 홈·상세에 header/top/section/bottom 슬롯을 푸터에서 만들어 테마 DOM 으로 옮긴다
 *                      · 자체 홍보 폴백(팔린 광고가 없는 자리를 채움, 페이지당 최대 2칸)
 *   4.3.0              기사 본문 자동삽입 + 쇼핑 캐러셀 + GA4 성과 집계
 *
 * ── 위치(통합센터에서 지정) ──
 *   헤더아래(header) / 콘텐츠첫칸(top) / 본문중간(in-content) / 섹션아래(section) / 페이지끝(bottom) / 사이드바(sidebar)
 *   같은 위치에 여러 광고가 있으면 '우선순위(낮을수록 먼저)' 순으로 위→아래 슬롯에 자동 배정.
 *   중간(in-content)은 본문을 3등분한 경계에 2칸이 생기고, 우선순위대로 채워진다(모자라면 아래는 빔).
 *
 * ── 워드프레스에서 할 일 ──
 *   1) 기사 본문: 자동(플러그인이 상단/중간/하단 삽입). 할 일 없음.
 *   2) 사이드바: '텍스트' 위젯에 [xinchao_ad slot="sidebar" max="300"] 한 번만.
 *
 * 데이터: https://daily-news-final.vercel.app/api/public/ads  (CORS 허용, 1분 캐시)
 * 광고 없는 슬롯은 표시 안 함(빈 공간 없음).
 */

if (!defined('ABSPATH')) exit;

define('XINCHAO_UNIFIED_ADS_API', 'https://daily-news-final.vercel.app/api/public/ads');

// ── 기사 본문 자동 삽입 설정 (여기 숫자만 바꾸면 됨) ──
define('XINCHAO_BODY_SLOTS', 2);      // 중간 광고 칸 수 (본문을 칸수+1 로 등분한 경계에 넣는다)
define('XINCHAO_BODY_MAX', 728);      // 본문 광고 최대 폭(px)
define('XINCHAO_BODY_ENABLED', true); // 본문 자동삽입 on/off

/**
 * 지금 보고 있는 페이지가 통합센터의 어느 '페이지 버킷'인지 판정한다.
 *
 * 왜 필요한가 (2026-08-23):
 *   사이드바 숏코드가 page 없이 불려서, "상세페이지 전용"으로 판 광고가 홈에도 떴다.
 *   광고주와의 약속이 지켜지지 않는 것이라, 값을 손으로 적게 두지 않고 자동으로 판정한다.
 *
 * @return string '' | home | news-terminal | detail
 */
function xinchao_current_page_bucket() {
    if (is_singular('post')) return 'detail';
    if (is_front_page() || is_home()) return 'home';
    $post = get_post();
    if ($post && has_shortcode($post->post_content, 'daily_news_list')) return 'news-terminal';
    return '';
}

/**
 * 자체 홍보("기본 광고") 소재 — 팔린 광고가 없는 슬롯을 채운다. (PROGRESS_AD_SLOTS.md §9)
 *
 * 통합센터에 광고로 등록하지 않고 여기 내장하는 이유:
 *   등록하면 노출 통계가 유료 광고와 섞이고, 만료일 관리 대상이 된다.
 *
 * 이미지가 아니라 HTML 배너다 — 새 이미지 파일을 서버에 올릴 필요가 없고 어떤 폭에서도 안 깨진다.
 */
function xinchao_house_creatives() {
    return array(
        array(
            'id'    => 'house_app',
            'title' => '씬짜오 앱 설치',
            'sub'   => '베트남 생활 정보를 손안에 — 당근·구인·부동산·뉴스',
            'cta'   => '무료 설치',
            'url'   => 'https://vnkorlife.com/download',
            'c1'    => '#f97316', 'c2' => '#ea580c',
        ),
        // 📌 구독 권유 소재를 **여기 두지 않는다** (2026-09-03).
        //    jenny-daily-news.php 에 이미 `jenny_subscribe_box()` 가 있고, 그쪽은
        //    **사이트 안에서 바로 접수되는 폼**이다(모달 + REST). 밖으로 링크만 보내는
        //    배너보다 낫다. 여기에 또 만들면 한 화면에 구독 권유가 둘이 된다 —
        //    실제로 잠깐 그렇게 만들었다가 홈·기사에서 중복이 나서 걷어냈다.
        array(
            'id'    => 'house_magazine',
            'title' => '교민 생활정보 씬짜오',
            'sub'   => '한인 업소록 · 일자리 · 부동산을 한 곳에서',
            'cta'   => '보러 가기',
            'url'   => 'https://vnkorlife.com/',
            'c1'    => '#0ea5e9', 'c2' => '#0369a1',
        ),
        array(
            // 2026-09-03 추가. 본문 맨 아래 자리 — "우리가 뭐 하는 데인지" 한 곳으로 모으는 창구.
            // vnkorlife.com/xinchao = 「씬짜오베트남 디지털 라인」(매거진·데일리뉴스·앱·생활정보 안내)
            'id'    => 'house_digital',
            'title' => '씬짜오베트남 디지털 라인',
            'sub'   => '매거진 · 데일리뉴스 · 앱 · 생활정보 서비스를 한눈에',
            'cta'   => '둘러보기',
            'url'   => 'https://vnkorlife.com/xinchao',
            'c1'    => '#334155', 'c2' => '#0f172a',
        ),
        array(
            'id'    => 'house_contact',
            'title' => '이 자리에 광고하세요',
            'sub'   => '씬짜오 베트남 · 앱 · 웹 통합 광고 문의',
            'cta'   => '광고 문의',
            'url'   => 'https://chaovietnam.co.kr/ad-inquiry/',
            'c1'    => '#8b5cf6', 'c2' => '#6d28d9',
        ),
    );
}

// 한 페이지에서 자체 홍보를 최대 몇 칸까지 그릴지. 20칸이 전부 우리 배너면 도배로 보인다.
define('XINCHAO_HOUSE_MAX', 2);

/**
 * 자체 홍보 배너 **하나를 지정해서** 그린다 (2026-08-31).
 *
 * xinchao_render_ad() 의 자체 홍보는 **폴백**이다 — 팔린 광고가 있으면 안 나오고,
 * 한 페이지 2칸 제한도 걸린다. 뉴스 터미널처럼 "우리 것 3개는 반드시 보여야 하는"
 * 자리에는 그 방식이 맞지 않아, 서버에서 곧바로 그리는 길을 따로 둔다.
 *
 * 생김새는 폴백 배너(위 makeHouse)와 **같게** 맞춘다 — 독자 눈에 다른 물건이
 * 하나 더 생기는 것보다 익숙한 모양이 낫다.
 *
 * @param string $id  house_app | house_magazine | house_contact
 * @param int    $max 최대 폭(px)
 */
/**
 * 이 페이지에서 서버가 이미 그린 자체 홍보 소재 id 목록.
 * 왜 필요한가 (2026-09-03): 뉴스 터미널은 house_app 을 일부러 서버에서 그리는데,
 * 본문 끝 안내 띠도 같은 소재를 그려 「씬짜오 앱 설치」가 두 번 떴다.
 * JS 폴백은 DOM 을 보고 피할 수 있지만 **서버 렌더끼리는 서로를 못 본다** — 그래서 기록해 둔다.
 */
function &xinchao_house_drawn() {
    static $drawn = array();
    return $drawn;
}

function xinchao_house_banner($id, $max = 728) {
    $found = null;
    foreach (xinchao_house_creatives() as $h) {
        if ($h['id'] === $id) { $found = $h; break; }
    }
    if (!$found) return '';

    $drawn =& xinchao_house_drawn();
    if (!in_array($id, $drawn, true)) $drawn[] = $id;

    return '<div style="max-width:' . (int) $max . 'px;margin:14px auto;">'
        . '<a href="' . esc_url($found['url']) . '" target="_blank" rel="noopener" '
        . 'aria-label="' . esc_attr($found['title']) . '" '
        . 'data-xc-house="' . esc_attr($found['id']) . '" '
        . 'style="display:flex;align-items:center;justify-content:space-between;gap:12px;'
        . 'padding:14px 16px;border-radius:10px;text-decoration:none;text-align:left;'
        . 'background:linear-gradient(135deg,' . esc_attr($found['c1']) . ','
        . esc_attr($found['c2']) . ');color:#fff;">'
        . '<div style="min-width:0;">'
        . '<div style="font-size:15px;font-weight:800;line-height:1.3;">'
        . esc_html($found['title']) . '</div>'
        . '<div style="font-size:12px;opacity:.9;margin-top:2px;line-height:1.35;">'
        . esc_html($found['sub']) . '</div></div>'
        . '<span style="flex:0 0 auto;background:rgba(255,255,255,.22);border-radius:999px;'
        . 'padding:7px 14px;font-size:12px;font-weight:800;white-space:nowrap;">'
        . esc_html($found['cta']) . '</span></a></div>';
}

/** 숏코드 — 원하는 자리에 직접. `[xinchao_house id="house_app"]` */
add_shortcode('xinchao_house', function ($atts) {
    $a = shortcode_atts(array('id' => 'house_app', 'max' => '728'), $atts, 'xinchao_house');
    return xinchao_house_banner($a['id'], intval($a['max']));
});

/**
 * 광고 슬롯 HTML(컨테이너 + 로드 스크립트).
 * 같은 page URL 은 한 번만 fetch, 모든 슬롯이 공유(window.__xcAd). 클라이언트에서 위치(slot)로 거른다.
 *   - $n = '' (빈값)  → 해당 위치의 광고 '전체'를 우선순위 순으로 세로로 쌓아 표시 (사이드바에 적합).
 *   - $n = 정수       → 해당 위치의 n번째(0=1등) 광고 1개만 (본문 슬롯 배분용).
 *
 * ⚠️ 컨테이너 클래스는 `xc-slot` 이다. `ad`·`banner`·`e3lan` 같은 낱말을 쓰면
 *    광고차단 필터에 걸려 유료 광고가 통째로 안 보인다(PROGRESS_AD_SLOTS.md §5-1 실측).
 *
 * @param string     $page  '' | home | news-terminal | detail   ('' = 현재 페이지 자동 판정)
 * @param string     $slot  '' | header | top | in-content | section | bottom | sidebar
 * @param int|string $n     '' = 전체 쌓기 / 정수 = 그 순번 1개
 * @param int        $max   최대 폭(px)
 * @param bool       $house 팔린 광고가 없을 때 자체 홍보로 채울지 (§9)
 */
function xinchao_render_ad($page = '', $slot = '', $n = 0, $max = 728, $house = true) {
    $stack = ($n === '' || $n === null);   // 빈값이면 전체 쌓기
    $ni = $stack ? 0 : (int) $n;
    if ($page === '') $page = xinchao_current_page_bucket();
    $uid = 'xcs_' . wp_generate_password(8, false, false);
    $url = XINCHAO_UNIFIED_ADS_API . ($page ? ('?page=' . rawurlencode($page)) : '');

    ob_start();
    ?>
    <div id="<?php echo esc_attr($uid); ?>" class="xc-slot" style="max-width:<?php echo (int)$max; ?>px;margin:14px auto;text-align:center;"></div>
    <script>
    (function(){
      var el = document.getElementById(<?php echo json_encode($uid); ?>);
      if (!el) return;
      var url = <?php echo json_encode($url); ?>;
      var slot = <?php echo json_encode($slot); ?>;
      var n = <?php echo (int)$ni; ?>;
      var stack = <?php echo $stack ? 'true' : 'false'; ?>;
      var houseOk = <?php echo $house ? 'true' : 'false'; ?>;
      var house = <?php echo wp_json_encode(xinchao_house_creatives()); ?>;
      var houseMax = <?php echo (int) XINCHAO_HOUSE_MAX; ?>;
      var dbgName = <?php echo json_encode(($page ?: 'auto') . ' / ' . ($slot ?: 'all') . ($stack ? '' : (' #' . $ni))); ?>;

      // ── 슬롯 진단 모드 ────────────────────────────────────────────────
      // 광고가 없는 슬롯은 스스로 숨는다 → "자리가 제대로 잡혔는지" 확인할 방법이 없었다.
      // ?xcads=debug 로 켜고 ?xcads=off 로 끈다. 켠 상태는 sessionStorage 에 남아
      // 페이지를 옮겨 다녀도 유지된다. 켠 사람 브라우저에서만 보이므로 독자에겐 영향 없다.
      // 각 슬롯이 스스로 판정한다 — 다른 스크립트가 먼저 돌기를 기다리지 않아 순서 문제가 없다.
      var dbg = (function(){
        try {
          var q = new URLSearchParams(location.search).get('xcads');
          if (q === 'debug') sessionStorage.setItem('xcads_debug', '1');
          if (q === 'off')   sessionStorage.removeItem('xcads_debug');
          return sessionStorage.getItem('xcads_debug') === '1';
        } catch (e) { return false; }
      })();

      // 진단용 이름표. 어느 지면·어느 자리·몇 번째 칸인지 그대로 적는다.
      function tag(text, color){
        var d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = 'font:11px/1.4 monospace;color:#fff;background:' + color
          + ';padding:2px 8px;border-radius:4px;display:inline-block;margin:0 0 4px;';
        return d;
      }
      // 빈 슬롯 자리를 보여주는 점선 상자
      function emptyBox(){
        var d = document.createElement('div');
        d.style.cssText = 'border:2px dashed #cbd5e1;border-radius:8px;padding:14px 10px;'
          + 'background:repeating-linear-gradient(45deg,#f8fafc,#f8fafc 8px,#f1f5f9 8px,#f1f5f9 16px);';
        d.appendChild(tag('빈 슬롯 · ' + dbgName, '#64748b'));
        return d;
      }

      window.__xcAd = window.__xcAd || {};
      var p = window.__xcAd[url] || (window.__xcAd[url] = fetch(url, { credentials: 'omit' }).then(function(r){ return r.json(); }));

      // ── 광고 성과 집계 (2026-08-09 신설) ───────────────────────────────
      // 왜: 광고를 팔면서 광고주에게 "몇 명이 봤고 몇 명이 눌렀다"를 줄 수 없었다.
      //     이 플러그인에는 클릭·노출 집계가 한 줄도 없었다.
      // 어디로: GA4(gtag). 이 사이트에 이미 G-QTCWJ6GGH0 이 실려 있고,
      //     앱도 같은 속성에 같은 이벤트명(promo_impression/promo_click)으로 보낸다.
      //     → 웹·앱을 한 번의 질의로 합산해 광고주 월간 리포트를 만든다.
      // 노출 기준: 화면에 절반 이상 들어왔을 때 1회. HTML 에 그려진 것만으로는
      //     "봤다"고 할 수 없다(스크롤로 지나치지도 않은 하단 광고까지 세게 된다).
      var seen = window.__xcAdSeen = window.__xcAdSeen || {};
      function send(name, ad, slotName){
        if (typeof gtag !== 'function') return;   // GA 미로드 시 조용히 통과
        try {
          gtag('event', name, {
            promo_id:   String(ad.id || ''),
            promo_name: ad.title || '',
            promo_slot: slotName || ad.slot || 'unknown'
          });
        } catch (e) {}
      }
      function watchImpression(node, ad, slotName){
        var key = (ad.id || '') + '|' + (slotName || '');
        if (seen[key]) return;                    // 한 페이지에서 같은 광고는 1회만
        if (!('IntersectionObserver' in window)) { seen[key] = 1; send('promo_impression', ad, slotName); return; }
        var io = new IntersectionObserver(function(entries){
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              if (!seen[key]) { seen[key] = 1; send('promo_impression', ad, slotName); }
              io.disconnect();
            }
          }
        }, { threshold: 0.5 });
        io.observe(node);
      }
      // ──────────────────────────────────────────────────────────────────

      function make(ad){
        if (!ad || !ad.imageUrl) return null;
        var a = document.createElement('a');
        a.href = ad.linkUrl || '#'; a.target = '_blank'; a.rel = 'noopener sponsored';
        a.setAttribute('aria-label', ad.title || '광고'); a.style.display = 'block'; a.style.marginBottom = '14px';
        var img = document.createElement('img');
        img.src = ad.imageUrl; img.alt = ad.title || ''; img.loading = 'lazy';
        img.style.cssText = 'display:block;width:100%;height:auto;border-radius:8px;';
        a.appendChild(img);
        // 클릭 집계. target=_blank 라 페이지가 안 닫히므로 전송이 끊기지 않는다.
        a.addEventListener('click', function(){ send('promo_click', ad, slot); });
        watchImpression(a, ad, slot);
        return a;
      }

      // ── 자체 홍보 폴백 (§9) ────────────────────────────────────────────
      // 팔린 광고가 없는 슬롯에만 그린다 — 유료 광고가 들어오면 자동으로 밀려난다.
      // 한 페이지 최대 houseMax 칸. 소재는 순서대로 돌려 같은 페이지에서 겹치지 않게 한다.
      function makeHouse(){
        if (!houseOk || !house.length) return null;
        var used = window.__xcHouseN || 0;
        if (used >= houseMax) return null;

        // 본문 끝 안내 띠(xinchao_cta_strip)가 서버에서 이미 그린 소재는 건너뛴다.
        // 안 그러면 같은 페이지에 「씬짜오 앱 설치」가 두 번 뜬다 (2026-09-03 실측: 뉴스 터미널).
        // 폴백은 JS 로 나중에 그리므로 PHP 쪽에서 알 수 없다 — 여기서 DOM 을 보고 피한다.
        var pool = house.filter(function(c){
          return !document.querySelector('[data-xc-house="' + c.id + '"]');
        });
        if (!pool.length) return null;

        window.__xcHouseN = used + 1;
        var h = pool[used % pool.length];
        var a = document.createElement('a');
        a.href = h.url; a.target = '_blank'; a.rel = 'noopener';
        a.setAttribute('aria-label', h.title);
        // 서버에서 그린 배너(xinchao_house_banner)와 같은 표식을 단다.
        // ① 위 pool 필터가 슬롯끼리도 겹치지 않게 해준다 ② 성과 집계 기준이 한 벌로 통일된다.
        a.setAttribute('data-xc-house', h.id);
        a.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;'
          + 'padding:14px 16px;border-radius:10px;text-decoration:none;text-align:left;'
          + 'background:linear-gradient(135deg,' + h.c1 + ',' + h.c2 + ');color:#fff;margin-bottom:14px;';
        var txt = document.createElement('div');
        txt.style.cssText = 'min-width:0;';
        var t1 = document.createElement('div');
        t1.textContent = h.title;
        t1.style.cssText = 'font-size:15px;font-weight:800;line-height:1.3;';
        var t2 = document.createElement('div');
        t2.textContent = h.sub;
        t2.style.cssText = 'font-size:12px;opacity:.9;margin-top:2px;line-height:1.35;';
        txt.appendChild(t1); txt.appendChild(t2);
        var btn = document.createElement('span');
        btn.textContent = h.cta;
        btn.style.cssText = 'flex:0 0 auto;background:rgba(255,255,255,.22);border-radius:999px;'
          + 'padding:7px 14px;font-size:12px;font-weight:800;white-space:nowrap;';
        a.appendChild(txt); a.appendChild(btn);
        // 집계는 하되 promo_id 를 house_* 로 구분한다 → 광고주 리포트에서 제외할 수 있다.
        a.addEventListener('click', function(){ send('promo_click', h, slot); });
        watchImpression(a, h, slot);
        return a;
      }

      // 슬롯을 마무리한다.
      //   광고 있음 → 그대로 (진단 모드면 무슨 자리인지 이름표를 얹는다)
      //   광고 없음 → 자체 홍보 → 그것도 못 쓰면 진단 모드에선 빈 상자, 아니면 숨김
      function finish(filled){
        if (filled) {
          if (dbg) el.insertBefore(tag('광고 · ' + dbgName, '#16a34a'), el.firstChild);
          return;
        }
        var hs = makeHouse();
        if (hs) {
          el.appendChild(hs);
          if (dbg) el.insertBefore(tag('자체 홍보 · ' + dbgName, '#7c3aed'), el.firstChild);
          return;
        }
        if (dbg) { el.appendChild(emptyBox()); return; }
        el.style.display = 'none';
        hideEmptyWidget();
      }

      // 슬롯이 사이드바 위젯 안에 '홀로' 있으면 위젯 상자까지 숨긴다.
      // 테마가 위젯마다 바깥 여백을 주기 때문에, 슬롯만 숨기면 빈 틈이 남는다.
      // ⚠️ 제목이나 다른 내용이 있는 위젯은 절대 건드리지 않는다 —
      //    글자가 남아 있으면(textContent) 그 위젯은 슬롯 전용이 아니다.
      function hideEmptyWidget(){
        try {
          if (!el.closest) return;
          var w = el.closest('.widget');
          if (!w) return;
          // ⚠️ w.textContent 를 그대로 쓰면 안 된다 — 슬롯이 심어 놓은 <script> 안의
          //    자바스크립트 소스까지 '글자'로 세어, 빈 위젯이 절대 비어 보이지 않는다
          //    (4.6.0 이 이 이유로 동작하지 않았다). 사본에서 script/style 을 떼고 본다.
          var probe = w.cloneNode(true);
          var junk = probe.querySelectorAll('script, style');
          for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
          if (probe.textContent.trim() !== '') return;          // 제목·글자가 있으면 그대로 둔다
          if (w.querySelector('img, iframe, ins, video')) return; // 다른 볼거리가 있으면 그대로
          w.style.display = 'none';
        } catch (e) {}
      }

      p.then(function(d){
        var ads = (d && d.ads) || [];
        if (slot) ads = ads.filter(function(a){ return a.slot === slot; });
        if (stack) {
          ads.forEach(function(ad){ var node = make(ad); if (node) el.appendChild(node); });
        } else {
          var node = make(ads[n]);
          if (node) el.appendChild(node);
        }
        finish(!!el.firstChild);
      }).catch(function(){ finish(false); });
    })();
    </script>
    <?php
    return ob_get_clean();
}

/**
 * [xinchao_ad slot="sidebar" max="300"] — 특정 위치(위젯/페이지) 삽입용.
 *   n 미지정 → 그 위치 광고 '전체'를 세로로 쌓음(사이드바에 적합, 위젯 1개로 광고 여러 개).
 *   n="0" 처럼 지정 → 그 순번 1개만.
 *   page 미지정 → 지금 보는 페이지로 자동 판정(홈 사이드바에 상세 전용 광고가 뜨던 문제 해결).
 *   house="0" → 자체 홍보 폴백 끄기.
 */
function xinchao_unified_ads_shortcode($atts) {
    $a = shortcode_atts(array('page' => '', 'slot' => '', 'n' => '', 'max' => '728', 'house' => '1'), $atts, 'xinchao_ad');
    return xinchao_render_ad($a['page'], $a['slot'], $a['n'], intval($a['max']), $a['house'] !== '0');
}
add_shortcode('xinchao_ad', 'xinchao_unified_ads_shortcode');

// 텍스트 위젯에서도 [xinchao_ad] 숏코드가 실행되게(사이드바 등)
add_filter('widget_text_content', 'do_shortcode', 11);

// 알리 상품 목록 정본 — vnkorlife 가 공개 API 로 내준다(aliProducts.json 이 원본).
//   갱신은 그 JSON 하나만 바꾸면 vnkorlife·chaovietnam·뉴스터미널이 동시에 반영된다.
define('XINCHAO_ALI_PRODUCTS_API', 'https://vnkorlife.com/api/public/ali-products');
define('XINCHAO_COUPANG_WIDGET', 'https://ads-partners.coupang.com/widgets.html?id=1019744&template=carousel&trackingCode=AF8354756&subId=&width=680&height=140&tsource=');

/**
 * 상품 목록을 서버에서 받아 캐시해 둔다.
 *
 * 왜 서버에서 받나 (2026-08-22 클라이언트 fetch 에서 전환):
 *   브라우저가 남의 도메인(vnkorlife.com)을 부르는 방식은 약하다. 광고차단기·백신
 *   (실제로 McAfee WebAdvisor)·회사 방화벽 중 하나만 걸려도 상품이 통째로 사라진다.
 *   그런 독자가 얼마나 되는지 알 방법도 없다.
 *   서버가 미리 받아 HTML 로 박아 내보내면 브라우저는 요청을 하지 않으니 차단당하지 않고,
 *   LiteSpeed 의 JS 지연과도 무관해진다.
 *
 * 캐시: 6시간. 상품은 Export 로 가끔 갱신되므로 이 정도면 충분하다.
 *   받아오기에 실패하면 직전 성공분을 계속 쓴다(하루). 화면이 비는 것보다 낫다.
 */
function xinchao_ali_fallback() {
    // 플러그인에 함께 실려 다니는 예비 상품 목록 (2026-08-22 기준 24개).
    // 왜 필요한가: 이 서버에서 vnkorlife API 로 나가는 요청이 실패하는 것을 실측했다
    //   (호스팅의 아웃바운드 차단 추정). 그러면 상품이 한 개도 안 나온다.
    //   API 가 되면 최신 목록을, 안 되면 이 예비분을 쓴다 — 화면이 비는 일은 없앤다.
    // 갱신: vnkorlife 의 aliProducts.json 을 바꾼 뒤 이 배열도 다시 만들어 넣으면 된다.
    return array(
    array('id'=>'1005005786319763','title'=>'Dog Cooling Mat Summer Pet Cold Bed Extra Large For Small Big Dogs Pet','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S4a6d90fec74a41b79812cd9bae5277d7b.jpg','price'=>'VND 50643','origPrice'=>'VND 120630','discount'=>'58%','url'=>'https://s.click.aliexpress.com/e/_c3zXn6p9'),
    array('id'=>'1005011660040270','title'=>'Arabian Brand Perfume High-end Men\'s Perfume Musk Oud And Cedarwood Wo','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S58cae3dfe9bc4e94a8529f0d75d8dc8e0.jpg','price'=>'VND 333068','origPrice'=>'VND 666136','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c4Lt1d9Z'),
    array('id'=>'1005005929119610','title'=>'2.5-50.6mm Black Conical Snap-on Silicone Rubber T Type Plug Blanking ','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S71abfdf4c6f5478e9e02d049ec0c2cd3W.jpg','price'=>'VND 6405','origPrice'=>'VND 7430','discount'=>'14%','url'=>'https://s.click.aliexpress.com/e/_c3gfpGSr'),
    array('id'=>'1005008114353969','title'=>'Electric Toothbrush Rotary Cleaning Teeth Brush Waterproof Electronic ','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S0cc43647f12d4453acbbc84ae82ec4ffn.jpg','price'=>'VND 375769','origPrice'=>'VND 854021','discount'=>'56%','url'=>'https://s.click.aliexpress.com/e/_c4FTWiaX'),
    array('id'=>'1005010604620104','title'=>'QIIY SS3-SS50 Crystal AB Black Glass Rhinestones Hot-fix Flatback Iron','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S53807aef993949f6b1408e3b276f3162n.jpg','price'=>'VND 76948','origPrice'=>'VND 130452','discount'=>'41%','url'=>'https://s.click.aliexpress.com/e/_c3GtvuLt'),
    array('id'=>'1005011875112273','title'=>'Satin Off Shoulder Pleated Mini Dress for Women Fashion Puff Sleeve Ci','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S9e405ac3949f42c1b74fb50b49187c4as.jpg','price'=>'VND 823575','origPrice'=>'VND 1871758','discount'=>'56%','url'=>'https://s.click.aliexpress.com/e/_c3WJTB9h'),
    array('id'=>'1005011851486393','title'=>'For Xiaomi H50 PRO / OV42GL Robot Vacuum Cleaner Accessories Main Side','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/Se79943b8a4704549b933c368e63dd37cu.jpg','price'=>'VND 304843','origPrice'=>'VND 358646','discount'=>'15%','url'=>'https://s.click.aliexpress.com/e/_c3yvIeub'),
    array('id'=>'1005011891938743','title'=>'Halter Crop Corset Low Waist Matching Sets Summer Trendy Back Lace Mer','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/Sb00b4729d9d74107a0777c37757e1be8f.jpg','price'=>'VND 1096606','origPrice'=>'VND 2492247','discount'=>'56%','url'=>'https://s.click.aliexpress.com/e/_c2u7Ltm7'),
    array('id'=>'1005009512222080','title'=>'Luxury Cologne Woody Unisex Perfume, Long Lasting Fresh Woody Aquatic ','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S3413ac0b2a3b4cab8ddc5088279bae9fx.jpg','price'=>'VND 273286','origPrice'=>'VND 546573','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c3ihurB9'),
    array('id'=>'1005009576148867','title'=>'Oral B EB20 Precision Clean Toothbrush Heads Deep Cleans Removes Plaqu','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S2167875b8f4941849e59cac0a0b2c713e.jpg','price'=>'VND 212908','origPrice'=>'VND 452973','discount'=>'53%','url'=>'https://s.click.aliexpress.com/e/_c3OOsPGr'),
    array('id'=>'1005008270321848','title'=>'Irresistible Scents With Oud Wood Men Sandalwood Perfume Lasting Orien','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S5921f02999a64f2ea039e742839f11eaj.jpg','price'=>'VND 213506','origPrice'=>'VND 427011','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c2xLmuAX'),
    array('id'=>'1005011879211764','title'=>'Elegant Vintage Polka Dot Lace Up Shirt for Women Long Lantern Sleeve ','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S2a81f57788924eb69865fbbcd871aa142.jpg','price'=>'VND 524497','origPrice'=>'VND 1219713','discount'=>'57%','url'=>'https://s.click.aliexpress.com/e/_c3N54iIP'),
    array('id'=>'1005011946133356','title'=>'Sequin Tassel Beach Mini Dress Women Satin Spaghetti Straps Square Nec','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S9c5369052b11456b9c98fb8c78a45fb7f.jpg','price'=>'VND 587951','origPrice'=>'VND 1434072','discount'=>'59%','url'=>'https://s.click.aliexpress.com/e/_c42S6qob'),
    array('id'=>'1005009361595401','title'=>'Sweet Milk Perfume Brand Long-lasting Fragrance White Rabbit Milk Cand','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/Se1e248a7264f4e359bbcba48b3a975c2f.jpg','price'=>'VND 182077','origPrice'=>'VND 364197','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c3neG3FH'),
    array('id'=>'1005010142565920','title'=>'Women\'s Long Coat Slim V Neck Single Breasted Overcoats Shoulder Pad M','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S43a8a508a02f4e488f263cbb5ea0fe80U.jpg','price'=>'VND 802993','origPrice'=>'VND 1867402','discount'=>'57%','url'=>'https://s.click.aliexpress.com/e/_c3fFyDbz'),
    array('id'=>'1005005528955452','title'=>'Turmeric Bearberry Vitamin Glutathione Skin Whitening Pills - 2000 mg ','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/A7ea54157acf7470a90c43abeb4508df5M.jpg','price'=>'VND 114524','origPrice'=>'VND 272646','discount'=>'58%','url'=>'https://s.click.aliexpress.com/e/_c3XMDmFp'),
    array('id'=>'1005007597951987','title'=>'0.3-1mm Stainless Steel Beading Wire Strong Jewelry Making Craft Wire ','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S387d8c3144754946ae30aa6825eb0432k.jpg','price'=>'VND 43213','origPrice'=>'VND 93942','discount'=>'54%','url'=>'https://s.click.aliexpress.com/e/_c3NppcCT'),
    array('id'=>'1005009043597267','title'=>'Gourmet Vanilla Women\'s Perfume Milk Gingerbread Master Mixed Woody Te','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S24b3f45505854833a5f5bf9330d0fcaby.jpg','price'=>'VND 258342','origPrice'=>'VND 516683','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c3hi4eSr'),
    array('id'=>'1005009248876625','title'=>'Luxury Angels Share Apple Brandy Unisex Perfume,Eau De Parfum,Fruity S','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/Sb31e08e6e214417a945bc7d2ca3439acg.jpg','price'=>'VND 259537','origPrice'=>'VND 519074','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c3vTKAk7'),
    array('id'=>'1005012189293362','title'=>'Genuine Cowhide Case For Zorro/Zippo Lighters Vintage Design Leather P','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S138051e8205b45dc89ca3ce85e3eeb3a5.jpg','price'=>'VND 136088','origPrice'=>'VND 272176','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c3dnbsmn'),
    array('id'=>'1005011792829052','title'=>'Upgraded Symbol Rumi Sword Prop Sets With Knife And Darts Fancy Cospla','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/Sdbc3c3a79d554c03996545a1e3ade6afO.jpg','price'=>'VND 130964','origPrice'=>'VND 218288','discount'=>'40%','url'=>'https://s.click.aliexpress.com/e/_c3CAlR8f'),
    array('id'=>'1005008827586639','title'=>'Baby Milk Fragrance Perfume Thailand High Quality Brand Milk Peony Tul','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S9735d99159a449ae8b12debbbd992bd9z.jpg','price'=>'VND 177807','origPrice'=>'VND 355657','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c4m7HaDl'),
    array('id'=>'1005008733247156','title'=>'Baby Milk Fragrance Fresh Perfume Talcum Powder Fragrance Lasting Frui','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S1830dd82ca4a4ef3acacf1739a011c46m.jpg','price'=>'VND 175075','origPrice'=>'VND 350149','discount'=>'50%','url'=>'https://s.click.aliexpress.com/e/_c2vhB2ux'),
    array('id'=>'1005006307408002','title'=>'New Design High-Quality PVC Three-Dimensional BABAYAGA Pencil Grocope ','image'=>'https://ae-pic-a1.aliexpress-media.com/kf/S6939fcabb67e4a379baaac2cc5e3f509z.jpg','price'=>'VND 23870','origPrice'=>'VND 61490','discount'=>'61%','url'=>'https://s.click.aliexpress.com/e/_c30ffAEf'),
    );
}

/**
 * 상품 목록을 서버에서 받아 캐시해 둔다. 못 받으면 예비분으로 버틴다.
 *
 * 왜 서버에서 받나 (2026-08-22 클라이언트 fetch 에서 전환):
 *   브라우저가 남의 도메인을 부르는 방식은 약하다. 광고차단기·백신·회사 방화벽 중
 *   하나만 걸려도 상품이 통째로 사라지고, 그런 독자가 얼마나 되는지 알 방법도 없다.
 *   서버가 받아 HTML 로 박아 내보내면 브라우저는 요청을 하지 않으니 차단당하지 않는다.
 *
 * 진단: 주소 끝에 ?xcshop_debug=1 을 붙이면 페이지 소스에
 *   <!-- xcshop: ... --> 로 API 성공/실패 사유가 찍힌다.
 */
function xinchao_get_ali_products($limit = 24) {
    $cached = get_transient('xinchao_ali_products');
    if (is_array($cached) && count($cached)) {
        $GLOBALS['xcshop_why'] = 'cache (' . count($cached) . ')';
        return array_slice($cached, 0, $limit);
    }

    $why = '';
    $res = wp_remote_get(XINCHAO_ALI_PRODUCTS_API, array('timeout' => 8));
    if (is_wp_error($res)) {
        $why = 'wp_error: ' . $res->get_error_message();
    } else {
        $code = wp_remote_retrieve_response_code($res);
        if ($code !== 200) {
            $why = 'http ' . $code;
        } else {
            $json = json_decode(wp_remote_retrieve_body($res), true);
            $items = (is_array($json) && isset($json['products']) && is_array($json['products']))
                ? $json['products'] : array();
            if ($items) {
                set_transient('xinchao_ali_products', $items, 6 * HOUR_IN_SECONDS);
                $GLOBALS['xcshop_why'] = 'api ok (' . count($items) . ')';
                return array_slice($items, 0, $limit);
            }
            $why = 'empty payload';
        }
    }

    $GLOBALS['xcshop_why'] = 'fallback - ' . $why;
    return array_slice(xinchao_ali_fallback(), 0, $limit);
}

/** "VND 50643" → "50,643₫" */
function xinchao_ali_price($v) {
    $n = preg_replace('/[^0-9]/', '', (string) $v);
    return $n === '' ? '' : number_format((int) $n) . '₫';
}

/**
 * ══ 쇼핑 캐러셀 (제휴 상품) ═════════════════════════════════════════
 * [xinchao_shopping]  — 알리익스프레스 상품 캐러셀 + (한국 접속자만) 쿠팡 배너.
 *   limit="24"   상품 몇 개까지 (기본 24)
 *   max="728"    최대 폭 px
 *   coupang="0"  쿠팡 배너 끄기 (기본 켬)
 *
 * 알리 = 서버 렌더(위 참조). 쿠팡만 작은 JS 로 지역을 가린다 —
 *   쿠팡은 한국 외 IP 를 차단(Access Denied)해서 베트남 방문자가 누르면 에러 페이지로 간다.
 *   서버에서 IP 국가를 알 방법이 없으므로 기기 시간대(Asia/Seoul)로 판별한다.
 *   ⚠️ VPN 은 IP 만 바꾸고 시간대는 그대로라, VPN 으로는 쿠팡이 안 뜬다(고장 아님).
 *
 * ⚠️ 고지문은 제휴 정책상 필수다. 알리·쿠팡 각각 지우지 말 것.
 */
function xinchao_render_shopping($limit = 24, $max = 728, $coupang = true) {
    $items = xinchao_get_ali_products($limit);
    if (!$items && !$coupang) return '';

    $uid = 'xcshop_' . wp_generate_password(8, false, false);
    // 쿠팡 지침(2026-08-31 공지): 고지는 소비자가 쉽게 확인하도록 — 눈에 띄는 색·굵기로.
    // (작은 회색이었다가 파란 굵은 글씨로 상향)
    $note = 'margin:4px 0 0;text-align:center;font-size:12px;font-weight:700;color:#0b57d0;';

    ob_start();
    // ?xcshop_debug=1 이면 어디서 상품을 가져왔는지 소스에 남긴다(진단용).
    if (isset($_GET['xcshop_debug'])) {
        echo '<!-- xcshop: ' . esc_html(isset($GLOBALS['xcshop_why']) ? $GLOBALS['xcshop_why'] : 'n/a')
           . ' | items=' . count($items) . ' -->';
    }
    ?>
    <div id="<?php echo esc_attr($uid); ?>" class="xinchao-shopping" style="max-width:<?php echo (int)$max; ?>px;margin:18px auto;">

      <?php if ($coupang) : ?>
      <?php // 기본은 숨김. 한국 시간대일 때만 JS 가 켠다(그때 iframe 을 붙인다 — 한국 밖에선 아예 안 부른다). ?>
      <div class="xcshop-coupang" style="display:none;margin:0 0 18px;">
        <div class="xcshop-coupang-frame" style="overflow-x:auto;"></div>
        <p style="<?php echo esc_attr($note); ?>">쿠팡 파트너스 활동의 일환으로 이에 따른 일정액의 수수료를 제공받습니다.</p>
      </div>
      <?php endif; ?>

      <?php if ($items) : ?>
      <div style="margin-bottom:10px;">
        <div style="font-size:15px;font-weight:800;color:#1e293b;">🛍️ 알리익스프레스 인기 상품</div>
        <div style="font-size:12px;color:#64748b;">해외직구 · 오늘의 특가</div>
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;">
        <?php foreach ($items as $it) :
            $title = isset($it['title']) ? $it['title'] : '';
            $img   = isset($it['image']) ? $it['image'] : '';
            $url   = isset($it['url']) ? $it['url'] : '';
            $disc  = isset($it['discount']) ? $it['discount'] : '';
            $price = xinchao_ali_price(isset($it['price']) ? $it['price'] : '');
            $orig  = xinchao_ali_price(isset($it['origPrice']) ? $it['origPrice'] : '');
            if (!$img || !$url) continue;
        ?>
        <a href="<?php echo esc_url($url); ?>" target="_blank" rel="noopener sponsored"
           data-ali-id="<?php echo esc_attr(isset($it['id']) ? $it['id'] : ''); ?>"
           data-ali-title="<?php echo esc_attr($title); ?>"
           style="flex:0 0 150px;width:150px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;text-decoration:none;color:#334155;">
          <div style="position:relative;width:150px;height:150px;background:#f8fafc;">
            <img src="<?php echo esc_url($img); ?>" alt="<?php echo esc_attr($title); ?>" loading="lazy"
                 style="width:150px;height:150px;object-fit:cover;display:block;">
            <?php if ($disc) : ?>
            <span style="position:absolute;left:6px;top:6px;background:#e62e04;color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;">-<?php echo esc_html($disc); ?></span>
            <?php endif; ?>
          </div>
          <div style="padding:7px;">
            <div style="font-size:11px;line-height:1.35;height:30px;overflow:hidden;color:#475569;"><?php echo esc_html($title); ?></div>
            <?php if ($price) : ?><div style="margin-top:3px;font-size:13px;font-weight:800;color:#e62e04;"><?php echo esc_html($price); ?></div><?php endif; ?>
            <?php if ($orig) : ?><div style="font-size:10px;color:#94a3b8;text-decoration:line-through;"><?php echo esc_html($orig); ?></div><?php endif; ?>
          </div>
        </a>
        <?php endforeach; ?>
      </div>
      <p style="<?php echo esc_attr($note); ?>">제휴 링크입니다. 클릭·구매 시 씬짜오 운영에 도움이 됩니다. (구매 가격은 동일합니다.)</p>
      <?php endif; ?>

    </div>
    <script data-no-optimize="1" data-no-defer="1" data-cfasync="false">
    (function(){
      var el = document.getElementById(<?php echo json_encode($uid); ?>);
      if (!el) return;

      // ── 광고차단 회피: Sahifa 의 .e3lan 영역에서 빠져나온다 ──────
      // e3lan 은 아랍어로 '광고'. 이 테마의 광고 클래스라 차단 필터 목록에 올라 있어
      // 영역이 통째로 display:none 된다(실측: 홈은 안 보이고 뉴스터미널은 보였다).
      // 상품 카드는 광고 스크립트가 아니라 우리 HTML 이므로, 그 영역 밖으로 옮기면 살아난다.
      try {
        var zone = el.closest ? el.closest('.e3lan') : null;
        if (zone && zone.parentNode) zone.parentNode.insertBefore(el, zone);
      } catch(e){}

      // ── 쿠팡: 한국 시간대일 때만 붙인다 ─────────────────────────
      var box = el.querySelector('.xcshop-coupang');
      if (box) {
        var korea = false;
        try {
          var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
          korea = (tz === 'Asia/Seoul' || tz === 'Asia/Pyongyang');
        } catch(e){}
        if (korea) {
          // iframe 을 태그 문자열로 넣는다(HTML 파서 경로).
          // 왜: createElement + 속성 대입으로 만들면 chaovietnam 에서 위젯 안쪽 상품
          //   이미지가 끝없이 로딩만 했다. 같은 위젯이 vnkorlife 에서는 정상이었고,
          //   차이는 워드프레스 쪽 LiteSpeed 뿐이었다. LiteSpeed 의 lazy-load 는
          //   나중에 끼어들어 iframe 의 src 를 걷어내므로, 파서가 속성을 한 번에
          //   적용하게 하고 제외 표시(data-no-lazy)를 함께 단다.
          box.querySelector('.xcshop-coupang-frame').innerHTML =
            '<iframe src="' + <?php echo json_encode(XINCHAO_COUPANG_WIDGET); ?> + '" width="680" height="140"'
            + ' title="쿠팡 추천 상품" referrerpolicy="unsafe-url"'
            + ' data-no-lazy="1" data-skip-lazy="1" data-lazyloaded="1"'
            + ' style="border:0;display:block;margin:0 auto;"></iframe>';
          box.style.display = '';
        }
      }

      // ── 집계: 기존 광고와 같은 GA4 이벤트에 실어 광고주 리포트와 한 곳에서 본다.
      //    노출은 캐러셀 1개 단위(카드마다 세면 이벤트가 폭주한다), 클릭은 상품별.
      function send(name, id, title){
        if (typeof gtag !== 'function') return;
        try { gtag('event', name, { promo_id: String(id||''), promo_name: title||'', promo_slot: 'shopping' }); } catch(e){}
      }
      el.querySelectorAll('a[data-ali-id]').forEach(function(a){
        a.addEventListener('click', function(){
          send('promo_click', 'ali_' + a.getAttribute('data-ali-id'), a.getAttribute('data-ali-title'));
        });
      });
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function(es){
          for (var i=0;i<es.length;i++) if (es[i].isIntersecting) { send('promo_impression','ali_carousel','알리익스프레스 캐러셀'); io.disconnect(); }
        }, { threshold: 0.5 });
        io.observe(el);
      } else {
        send('promo_impression','ali_carousel','알리익스프레스 캐러셀');
      }
    })();
    </script>
    <?php
    return ob_get_clean();
}

function xinchao_shopping_shortcode($atts) {
    $a = shortcode_atts(array('limit' => '24', 'max' => '728', 'coupang' => '1'), $atts, 'xinchao_shopping');
    return xinchao_render_shopping(intval($a['limit']), intval($a['max']), $a['coupang'] !== '0');
}
add_shortcode('xinchao_shopping', 'xinchao_shopping_shortcode');

/**
 * 기사 본문 자동 삽입 — 단일 글(post):
 *   본문 상단에 top 1개 → 본문을 등분한 경계에 in-content 2개 → 본문 끝에 bottom 1개.
 * wpautop(우선순위 10) 이후 동작하도록 the_content 우선순위 20. 렌더된 HTML 직접 삽입.
 *
 * ⚠️ 2026-08-23 변경 — 중간 광고가 '매 2단락마다'에서 '본문을 3등분한 2칸'으로 바뀌었다.
 *   왜: 예전 방식은 긴 기사에서 최대 6칸까지 늘어나 읽기 흐름이 끊겼고(8/21 알리 상품이
 *   문단마다 도배된 사고도 이 구조 탓), 기사마다 칸 수가 달라 "이 기사엔 몇 칸"을
 *   광고주에게 말할 수 없었다. 이제 단락 수와 무관하게 항상 같은 칸 수다.
 */
function xinchao_inject_body_ads($content) {
    if (!XINCHAO_BODY_ENABLED) return $content;
    if (is_admin()) return $content;
    if (!is_singular('post') || !in_the_loop() || !is_main_query()) return $content;

    $top    = xinchao_render_ad('detail', 'top', 0, XINCHAO_BODY_MAX);
    $bottom = xinchao_render_ad('detail', 'bottom', 0, XINCHAO_BODY_MAX);

    $paragraphs = explode('</p>', $content);

    // 빈 조각을 뺀 '진짜 단락'의 위치만 모은다. explode 결과에는 공백 조각이 섞인다.
    $real = array();
    foreach ($paragraphs as $i => $para) {
        if (trim($para) !== '') $real[] = $i;
    }
    $n = count($real);

    // 단락이 거의 없으면 상단 + 하단만 (중간을 끼울 자리가 없다)
    if ($n < 3) {
        return $top . $content . $bottom;
    }

    // 본문을 (칸수+1) 등분한 경계 뒤에 슬롯을 놓는다.
    // 중복 방지로 키에 담는다 — 아주 짧은 글은 두 경계가 같은 단락에 떨어질 수 있고,
    // 그러면 광고 두 개가 붙어 나온다.
    $cuts = array();
    for ($k = 1; $k <= XINCHAO_BODY_SLOTS; $k++) {
        $pos = (int) floor($n * $k / (XINCHAO_BODY_SLOTS + 1));
        if ($pos < 1) $pos = 1;
        if ($pos > $n - 1) $pos = $n - 1;   // 마지막 단락 뒤엔 안 넣는다 — 하단 슬롯이 따로 있다
        $cuts[$real[$pos - 1]] = true;
    }

    $body = '';
    $slot = 0; // 중간(in-content) 슬롯 순번 = 우선순위 순번
    foreach ($paragraphs as $index => $para) {
        if (trim($para) === '') { $body .= $para; continue; }
        $body .= $para . '</p>';
        if (isset($cuts[$index])) {
            $body .= xinchao_render_ad('detail', 'in-content', $slot++, XINCHAO_BODY_MAX);
        }
    }

    return $top . $body . $bottom;
}
add_filter('the_content', 'xinchao_inject_body_ads', 20);

// ═════════════════════════════════════════════════════════
// 📬 앱 설치 · 이메일 구독 안내 띠 — **모든 글·페이지 끝에 항상**
// ─────────────────────────────────────────────────────────
// 왜 자체 홍보(house) 배너로 안 하고 따로 두나 (2026-09-03, 사장님 지시):
//   자체 홍보는 **폴백**이다 — 팔린 광고가 있으면 안 나오고, 한 페이지 2칸 제한도 걸린다.
//   그래서 광고가 잘 팔린 페이지일수록 앱·구독 안내가 사라지는, 정확히 거꾸로 된 일이 생긴다.
//   마케팅 깔때기의 첫 칸(이메일)과 둘째 칸(앱 설치)은 **광고가 팔리든 말든 늘 있어야** 한다.
//
// 왜 큰 배너 두 개가 아니라 작은 띠 하나인가:
//   글 끝마다 배너 두 장이 서면 도배로 보인다. 한 줄에 버튼 둘이면 눈에 거슬리지 않으면서
//   "여기 누르면 되는구나"가 분명하다. 광고 슬롯과도 생김새가 겹치지 않는다.
//
// 어디에 붙나: 낱개 글·페이지(is_singular)의 본문 맨 끝. 목록·피드·검색결과에는 안 붙는다.
// ═════════════════════════════════════════════════════════
/**
 * ① 제목 바로 아래 — 이메일 구독.
 *
 * **있는 것을 쓴다, 새로 만들지 않는다.** jenny_subscribe_box() 는 사이트 안에서 바로
 * 접수되는 폼이고(밖으로 안 보낸다), 스스로 `static $drawn` 으로 한 페이지에 한 번만
 * 그린다 — 이미 띠가 나온 페이지(데일리뉴스 목록 등)에서는 빈 문자열을 돌려준다.
 * (2026-09-03: 이걸 모르고 따로 만들었다가 구독 권유가 두 개 뜨는 사고를 냈다)
 */
function xinchao_cta_subscribe() {
    return function_exists('jenny_subscribe_box') ? jenny_subscribe_box() : '';
}

/** ② 본문 한가운데 — 앱 설치. ③ 맨 아래 — 씬짜오 디지털 라인. */
function xinchao_cta_house($id) {
    // 이 페이지가 이미 같은 소재를 그렸으면 또 그리지 않는다 (뉴스 터미널 등)
    $drawn =& xinchao_house_drawn();
    if (in_array($id, $drawn, true)) return '';
    return xinchao_house_banner($id, XINCHAO_BODY_MAX);   // 안에서 $drawn 에 기록된다
}

/**
 * 본문에 CTA 를 **세 자리로 나눠** 넣는다 (2026-09-03, 사장님 지시).
 *
 * 왜 나누나: 맨 아래에 두 개를 뭉쳐 두니 홍보 효과가 없었다. 글 끝까지 읽는 사람은
 * 소수라 거기 모아 두면 대부분이 못 본다. 읽는 흐름 위에 하나씩 흩어 놓는다.
 *
 *   제목 아래   → 이메일 구독   (가장 잘 보이는 자리 · 깔때기 첫 칸)
 *   본문 한가운데 → 앱 설치       (읽다가 만나는 자리)
 *   맨 아래     → 디지털 라인    (다 읽은 사람에게 "우리가 뭐 하는 데인지")
 *
 * ⚠️ 한가운데(1/2)에 넣는 이유: 유료 광고가 이미 본문을 3등분해 1/3·2/3 에 들어간다
 *    (xinchao_inject_body_ads). 1/2 은 그 둘 사이라 서로 붙지 않는다.
 */
function xinchao_inject_cta($content) {
    // 낱개 글·페이지의 본문일 때만. 목록·발췌·피드·관리화면에는 붙이지 않는다.
    if (is_admin() || is_feed() || !is_singular()) return $content;
    if (!in_the_loop() || !is_main_query()) return $content;

    // 한 페이지에 두 번 그리지 않는다 (테마가 the_content 를 두 번 부르는 경우가 있다)
    static $done = false;
    if ($done) return $content;
    $done = true;

    $top    = xinchao_cta_subscribe();
    $bottom = xinchao_cta_house('house_digital');
    $mid    = xinchao_cta_house('house_app');

    if ($mid === '') return $top . $content . $bottom;

    // ⚠️ 단락 **개수**로 가운데를 잡으면 빗나간다 (2026-09-03 실측).
    //    소제목·표·목록이 많은 글은 <p> 가 적어서, 개수 기준 가운데가 글의 끝자락에 떨어진다.
    //    환율계산기 페이지에서 앱 배너와 디지털 라인이 53%·54% 로 **붙어 버렸다.**
    //    그래서 **글자 수**로 잰다 — 읽는 사람이 체감하는 '중간'은 그쪽이다.
    // 쓸 수 있는 단락 경계를 다 모은 뒤, **50% 에 가장 가까운 것**을 고른다.
    // 처음엔 "45% 를 처음 넘긴 곳"으로 했는데, 환율계산기 페이지처럼 앞에 큰 위젯이
    // 박힌 글은 그 구간에 단락 경계가 아예 없어 후보를 못 찾고 하단과 붙었다(실측).
    // 20~80% 범위만 쓴다 — 너무 앞이면 제목 아래 구독폼과, 너무 뒤면 하단과 붙는다.
    $parts = explode('</p>', $content);
    $total = max(1, strlen($content));
    $cut   = -1;
    $best  = 1.0;
    $acc   = 0;
    foreach ($parts as $i => $p) {
        $acc += strlen($p) + 4;                       // '</p>' 길이 보정
        if (trim($p) === '') continue;
        $ratio = $acc / $total;
        if ($ratio < 0.20 || $ratio > 0.80) continue;
        $dist = abs($ratio - 0.50);
        if ($dist < $best) { $best = $dist; $cut = $i; }
    }
    if ($cut < 0) return $top . $content . $mid . $bottom;   // 끼울 자리가 없으면 아래에 둔다

    $body = '';
    foreach ($parts as $i => $p) {
        if (trim($p) === '') { $body .= $p; continue; }
        $body .= $p . '</p>';
        if ($i === $cut) $body .= $mid;
    }
    return $top . $body . $bottom;
}
add_filter('the_content', 'xinchao_inject_cta', 25);   // 광고 삽입(20) 뒤에 붙는다

// ─────────────────────────────────────────────────────────
// 🧩 테마 지면 슬롯 (헤더 · 상단 · 섹션 · 하단) — 홈과 기사 상세
//
// 왜 JS 로 꽂는가:
//   시작 페이지는 테마(Sahifa)가 그린다. 우리 플러그인이 끼어들 PHP 훅이 없다.
//   테마 파일을 고치면 테마 업데이트 때 날아간다.
//   → 푸터에서 슬롯을 만들어 두고, 완성된 DOM 의 정해진 자리로 옮긴다.
//
// ⚠️ 테마의 광고 칸(.e3lan)에 넣지 않는다. e3lan 은 아랍어 '광고'이고 광고차단 필터에
//   등재돼 있어 그 안의 것은 통째로 사라진다(2026-08-22 실측). 우리 컨테이너는 xc-slot.
//
// ⚠️ 뉴스 터미널은 여기 대상이 아니다 — 그 화면은 jenny 플러그인이 통째로 만들므로
//   서버에서 직접 심는다(테마 헤더·#main-content 자체가 없다).
// ─────────────────────────────────────────────────────────

// 시작 페이지 섹션(cat-box) 아래 슬롯을 몇 개까지 만들지. 섹션이 이보다 적으면 있는 만큼만.
define('XINCHAO_HOME_SECTION_SLOTS', 12);

function xinchao_inject_dom_slots() {
    $page = xinchao_current_page_bucket();
    if ($page !== 'home' && $page !== 'detail') return;

    $items = array();
    // 헤더 아래 1칸 — 두 페이지 공통(사이트 어디서나 같은 자리라 '전 지면' 상품으로 팔린다)
    $items[] = array('anchor' => 'header', 'html' => xinchao_render_ad($page, 'header', 0, 970));

    if ($page === 'home') {
        // 헤더 하단(= 콘텐츠 첫 칸)
        $items[] = array('anchor' => 'top', 'html' => xinchao_render_ad($page, 'top', 0, 970));
        // 각 섹션 아래
        for ($i = 0; $i < XINCHAO_HOME_SECTION_SLOTS; $i++) {
            $items[] = array('anchor' => 'section:' . $i, 'html' => xinchao_render_ad($page, 'section', $i, 970, false));
        }
        // 페이지 끝
        $items[] = array('anchor' => 'bottom', 'html' => xinchao_render_ad($page, 'bottom', 0, 970));
    }

    echo '<div id="xc-stage" style="display:none">';
    foreach ($items as $it) {
        echo '<div data-xc-anchor="' . esc_attr($it['anchor']) . '">' . $it['html'] . '</div>';
    }
    echo '</div>';
    ?>
    <script>
    (function(){
      var stage = document.getElementById('xc-stage');
      if (!stage) return;
      var header  = document.getElementById('theme-header');
      var content = document.querySelector('#main-content .content')
                 || document.querySelector('#main-content')
                 || null;
      var boxes   = (content || document).querySelectorAll('section.cat-box');

      // 슬롯 하나를 제자리로 옮긴다. 자리를 못 찾으면 false → 숨긴 채로 둔다
      // (테마가 바뀌어도 페이지가 깨지지 않고, 그냥 그 칸만 없는 것이 된다).
      function place(node, anchor){
        var parts = anchor.split(':'), kind = parts[0], idx = parseInt(parts[1] || '0', 10);
        if (kind === 'header') {
          if (!header || !header.parentNode) return false;
          header.parentNode.insertBefore(node, header.nextSibling);
          return true;
        }
        if (kind === 'section') {
          var b = boxes[idx];
          if (!b || !b.parentNode) return false;
          b.parentNode.insertBefore(node, b.nextSibling);
          return true;
        }
        if (!content) return false;
        if (kind === 'top')    { content.insertBefore(node, content.firstChild); return true; }
        if (kind === 'bottom') { content.appendChild(node); return true; }
        return false;
      }

      // 진단 모드에서는 '자리를 못 찾은' 슬롯도 보여 준다.
      // 조용히 사라지면 왜 그 칸이 없는지 알 방법이 없다.
      var dbg = false;
      try { dbg = sessionStorage.getItem('xcads_debug') === '1'; } catch (e) {}

      var orphan = [];
      Array.prototype.slice.call(stage.children).forEach(function(w){
        if (place(w, w.getAttribute('data-xc-anchor'))) { w.style.display = ''; return; }
        orphan.push(w.getAttribute('data-xc-anchor'));
      });

      if (dbg && orphan.length) {
        var warn = document.createElement('div');
        warn.textContent = '⚠ 자리를 못 찾은 슬롯: ' + orphan.join(', ');
        warn.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;max-width:60vw;'
          + 'font:12px/1.4 monospace;color:#fff;background:#b91c1c;padding:8px 12px;border-radius:6px;';
        document.body.appendChild(warn);
      }

      stage.parentNode && stage.parentNode.removeChild(stage);
    })();
    </script>
    <?php
}
add_action('wp_footer', 'xinchao_inject_dom_slots', 5);

// ─────────────────────────────────────────────────────────
// 📋 광고 재고 조회 (관리자 전용) — 관리자 메뉴: 도구 → "광고 재고"
// 워드프레스에 흩어진 기존 광고(Advanced Ads + 사이드바 위젯)를 한 목록으로 보여준다.
// 담당자가 이 목록을 보고 통합 광고센터로 하나씩 옮기며 새 시스템을 익힌다. (읽기 전용)
// ─────────────────────────────────────────────────────────
add_action('admin_menu', function () {
    add_management_page('광고 재고', '📋 광고 재고', 'manage_options', 'xinchao-ad-inventory', 'xinchao_ad_inventory_page');
});

function xinchao_ad_extract_media($html) {
    $img = '';
    $link = '';
    if (preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $html, $m)) $img = $m[1];
    if (preg_match('/<a[^>]+href=["\']([^"\']+)["\']/i', $html, $m)) $link = $m[1];
    return array($img, $link);
}

function xinchao_ad_inventory_page() {
    if (!current_user_can('manage_options')) return;
    echo '<div class="wrap"><h1>📋 광고 재고 (통합센터 이관용)</h1>';
    echo '<p>워드프레스에 등록돼 있는 <b>기존 광고 목록</b>입니다. 이 목록을 보고 <b>통합 광고센터</b>(daily-news 관리자 → 통합 광고센터)에 하나씩 옮기세요. 옮긴 뒤 여기(위젯/Advanced Ads)에서 제거하면 됩니다.</p>';

    // 1) Advanced Ads
    echo '<h2 style="margin-top:24px">① Advanced Ads 광고</h2>';
    if (post_type_exists('advanced_ads')) {
        $ads = get_posts(array('post_type' => 'advanced_ads', 'numberposts' => -1, 'post_status' => 'any'));
        if ($ads) {
            echo '<table class="widefat striped"><thead><tr><th>제목</th><th>상태</th><th>미리보기</th><th>링크</th></tr></thead><tbody>';
            foreach ($ads as $ad) {
                list($img, $link) = xinchao_ad_extract_media($ad->post_content);
                if (!$img && has_post_thumbnail($ad->ID)) $img = get_the_post_thumbnail_url($ad->ID, 'medium');
                $opt = get_post_meta($ad->ID, 'advanced_ads_ad_options', true);
                if (is_array($opt)) {
                    if (!$img && !empty($opt['output']['image_id'])) $img = wp_get_attachment_url($opt['output']['image_id']);
                    if (!$link && !empty($opt['url'])) $link = $opt['url'];
                }
                echo '<tr><td><b>' . esc_html($ad->post_title) . '</b></td><td>' . esc_html($ad->post_status) . '</td>';
                echo '<td>' . ($img ? '<img src="' . esc_url($img) . '" style="max-width:140px;height:auto;border:1px solid #ddd">' : '—') . '</td>';
                echo '<td>' . ($link ? '<a href="' . esc_url($link) . '" target="_blank">' . esc_html($link) . '</a>' : '—') . '</td></tr>';
            }
            echo '</tbody></table>';
        } else {
            echo '<p>Advanced Ads 광고가 없습니다.</p>';
        }
    } else {
        echo '<p>Advanced Ads 플러그인이 없거나 광고가 없습니다.</p>';
    }

    // 2) 위젯 광고 (사이드바 등)
    echo '<h2 style="margin-top:24px">② 위젯 광고 (사이드바 · 푸터 등)</h2>';
    $sidebars = wp_get_sidebars_widgets();
    $registered = isset($GLOBALS['wp_registered_sidebars']) ? $GLOBALS['wp_registered_sidebars'] : array();
    echo '<table class="widefat striped"><thead><tr><th>위젯 영역</th><th>종류</th><th>미리보기</th><th>링크</th></tr></thead><tbody>';
    $rows = 0;
    foreach ($sidebars as $sidebar_id => $widget_ids) {
        if ($sidebar_id === 'wp_inactive_widgets' || !is_array($widget_ids)) continue;
        $area = isset($registered[$sidebar_id]['name']) ? $registered[$sidebar_id]['name'] : $sidebar_id;
        foreach ($widget_ids as $wid) {
            if (!preg_match('/^(.+)-(\d+)$/', $wid, $m)) continue;
            $base = $m[1];
            $idx = (int) $m[2];
            $instances = get_option('widget_' . $base);
            if (!is_array($instances) || !isset($instances[$idx])) continue;
            $inst = $instances[$idx];
            $img = '';
            $link = '';
            if ($base === 'media_image') {
                if (!empty($inst['attachment_id'])) $img = wp_get_attachment_url($inst['attachment_id']);
                if (!$img && !empty($inst['url'])) $img = $inst['url'];
                if (!empty($inst['link_url'])) $link = $inst['link_url'];
            } elseif ($base === 'text' || $base === 'custom_html') {
                $html = isset($inst['text']) ? $inst['text'] : (isset($inst['content']) ? $inst['content'] : '');
                list($img, $link) = xinchao_ad_extract_media($html);
            } else {
                // Sahifa/기타 광고 위젯: 인스턴스에서 이미지 URL 흔적을 최대한 추출(참고용)
                $blob = is_array($inst) ? wp_json_encode($inst, JSON_UNESCAPED_SLASHES) : (string) $inst;
                list($img, $link) = xinchao_ad_extract_media($blob);
                if (!$img && preg_match('/(https?:[^"\\\\ ]+\.(?:png|jpe?g|gif|webp))/i', $blob, $mm)) $img = $mm[1];
            }
            if (!$img && !$link) continue; // 광고성 아닌 위젯(검색·최근글 등) 제외
            $rows++;
            echo '<tr><td>' . esc_html($area) . '</td><td>' . esc_html($base) . '</td>';
            echo '<td>' . ($img ? '<img src="' . esc_url($img) . '" style="max-width:140px;height:auto;border:1px solid #ddd">' : '—') . '</td>';
            echo '<td>' . ($link ? '<a href="' . esc_url($link) . '" target="_blank">' . esc_html($link) . '</a>' : '—') . '</td></tr>';
        }
    }
    if (!$rows) echo '<tr><td colspan="4">광고성 위젯을 찾지 못했습니다.</td></tr>';
    echo '</tbody></table>';
    echo '<p style="margin-top:16px;color:#666">※ Sahifa 테마의 특수 광고칸(헤더 등)은 여기 안 잡힐 수 있습니다. 테마 옵션도 함께 확인하세요.</p>';
    echo '</div>';
}
