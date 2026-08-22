<?php
/**
 * Plugin Name: XinChao 통합 광고 (Unified Ads)
 * Description: 통합 광고센터(ads_unified)의 chaovietnam 지면 광고를 공개 API로 불러와 표시한다. 기사 본문에 위치별 자동 삽입 — 상단(1) + 중간(매 N단락마다) + 하단(1). 사이드바는 [xinchao_ad slot="sidebar"] 숏코드. Advanced Ads/Ad Inserter 불필요. 직원은 통합센터에서 등록만 하면 되고, 위치는 우선순위로 자동 결정.
 * Version: 3.3.0
 * Author: XinChao
 *
 * ── 위치(통합센터에서 지정) ──
 *   상단(top) / 중간(in-content) / 하단(bottom) / 사이드바(sidebar)
 *   같은 위치에 여러 광고가 있으면 '우선순위(낮을수록 먼저)' 순으로 위→아래 슬롯에 자동 배정.
 *   중간(in-content)은 기사 본문 매 N단락마다 슬롯이 생기고, 우선순위대로 채워진다(모자라면 아래는 빔).
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
define('XINCHAO_BODY_EVERY', 2);      // 중간 광고: 몇 단락마다
define('XINCHAO_BODY_MAX', 728);      // 본문 광고 최대 폭(px)
define('XINCHAO_BODY_ENABLED', true); // 본문 자동삽입 on/off

/**
 * 광고 슬롯 HTML(컨테이너 + 로드 스크립트).
 * 같은 page URL 은 한 번만 fetch, 모든 슬롯이 공유(window.__xcAd). 클라이언트에서 위치(slot)로 거른다.
 *   - $n = '' (빈값)  → 해당 위치의 광고 '전체'를 우선순위 순으로 세로로 쌓아 표시 (사이드바에 적합).
 *   - $n = 정수       → 해당 위치의 n번째(0=1등) 광고 1개만 (본문 슬롯 배분용).
 *
 * @param string     $page  '' | home | news-terminal | detail
 * @param string     $slot  '' | top | in-content | bottom | sidebar
 * @param int|string $n     '' = 전체 쌓기 / 정수 = 그 순번 1개
 * @param int        $max   최대 폭(px)
 */
function xinchao_render_ad($page = '', $slot = '', $n = 0, $max = 728) {
    $stack = ($n === '' || $n === null);   // 빈값이면 전체 쌓기
    $ni = $stack ? 0 : (int) $n;
    $uid = 'xcad_' . wp_generate_password(8, false, false);
    $url = XINCHAO_UNIFIED_ADS_API . ($page ? ('?page=' . rawurlencode($page)) : '');

    ob_start();
    ?>
    <div id="<?php echo esc_attr($uid); ?>" class="xinchao-ad" style="max-width:<?php echo (int)$max; ?>px;margin:14px auto;text-align:center;"></div>
    <script>
    (function(){
      var el = document.getElementById(<?php echo json_encode($uid); ?>);
      if (!el) return;
      var url = <?php echo json_encode($url); ?>;
      var slot = <?php echo json_encode($slot); ?>;
      var n = <?php echo (int)$ni; ?>;
      var stack = <?php echo $stack ? 'true' : 'false'; ?>;
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
      p.then(function(d){
        var ads = (d && d.ads) || [];
        if (slot) ads = ads.filter(function(a){ return a.slot === slot; });
        if (stack) {
          ads.forEach(function(ad){ var node = make(ad); if (node) el.appendChild(node); });
          if (!el.firstChild) el.style.display = 'none';
        } else {
          var node = make(ads[n]);
          if (node) el.appendChild(node); else el.style.display = 'none';
        }
      }).catch(function(){ el.style.display = 'none'; });
    })();
    </script>
    <?php
    return ob_get_clean();
}

/**
 * [xinchao_ad slot="sidebar" max="300"] — 특정 위치(위젯/페이지) 삽입용.
 *   n 미지정 → 그 위치 광고 '전체'를 세로로 쌓음(사이드바에 적합, 위젯 1개로 광고 여러 개).
 *   n="0" 처럼 지정 → 그 순번 1개만.
 */
function xinchao_unified_ads_shortcode($atts) {
    $a = shortcode_atts(array('page' => '', 'slot' => '', 'n' => '', 'max' => '728'), $atts, 'xinchao_ad');
    return xinchao_render_ad($a['page'], $a['slot'], $a['n'], intval($a['max']));
}
add_shortcode('xinchao_ad', 'xinchao_unified_ads_shortcode');

// 텍스트 위젯에서도 [xinchao_ad] 숏코드가 실행되게(사이드바 등)
add_filter('widget_text_content', 'do_shortcode', 11);

/**
 * ══ 쇼핑 캐러셀 (제휴 상품) ═════════════════════════════════════════
 * [xinchao_shopping]  — 알리익스프레스 상품 캐러셀 + (한국 접속자만) 쿠팡 배너.
 *   limit="24"   상품 몇 개까지 (기본 24)
 *   max="728"    최대 폭 px
 *   coupang="0"  쿠팡 배너 끄기 (기본 켬)
 *
 * 왜 숏코드인가: 상품 HTML 을 지면마다 붙여넣으면 상품을 바꿀 때 전부 다시 손봐야 한다.
 *   상품 목록은 vnkorlife 가 공개 API 로 한 곳에서 내주고, 각 지면은 불러다 그린다.
 *   → 갱신은 aliProducts.json 하나만 바꾸면 vnkorlife·chaovietnam·뉴스터미널 동시 반영.
 *
 * 지역: 알리는 한국·베트남 양쪽 다 배송되므로 항상 보여준다.
 *   쿠팡만 한국 접속자에게 보여준다 — 쿠팡은 한국 외 IP 를 차단(Access Denied)하므로
 *   베트남 방문자가 누르면 에러 페이지로 간다. 판별은 기기 시간대(Asia/Seoul).
 *   ⚠️ VPN 은 IP 만 바꾸고 시간대는 그대로라, VPN 으로는 쿠팡이 안 뜬다(고장 아님).
 *
 * ⚠️ 고지문은 제휴 정책상 필수다. 알리·쿠팡 각각 지우지 말 것.
 */
define('XINCHAO_ALI_PRODUCTS_API', 'https://vnkorlife.com/api/public/ali-products');
define('XINCHAO_COUPANG_WIDGET', 'https://ads-partners.coupang.com/widgets.html?id=1019744&template=carousel&trackingCode=AF8354756&subId=&width=680&height=140&tsource=');

function xinchao_render_shopping($limit = 24, $max = 728, $coupang = true) {
    $uid = 'xcshop_' . wp_generate_password(8, false, false);

    ob_start();
    ?>
    <div id="<?php echo esc_attr($uid); ?>" class="xinchao-shopping" style="max-width:<?php echo (int)$max; ?>px;margin:18px auto;"></div>
    <script>
    (function(){
      var el = document.getElementById(<?php echo json_encode($uid); ?>);
      if (!el) return;
      var API         = <?php echo json_encode(XINCHAO_ALI_PRODUCTS_API); ?>;
      var LIMIT       = <?php echo (int)$limit; ?>;
      var COUPANG_ON  = <?php echo $coupang ? 'true' : 'false'; ?>;
      var COUPANG_SRC = <?php echo json_encode(XINCHAO_COUPANG_WIDGET); ?>;

      // ── 집계: 기존 광고와 같은 GA4 이벤트에 실어 광고주 리포트와 한 곳에서 본다.
      //    캐러셀은 카드가 수십 개라 카드마다 노출을 세면 이벤트가 폭주한다 →
      //    노출은 '캐러셀 1개' 단위로, 클릭은 상품별로 센다.
      function send(name, id, title){
        if (typeof gtag !== 'function') return;
        try { gtag('event', name, { promo_id: String(id||''), promo_name: title||'', promo_slot: 'shopping' }); } catch(e){}
      }
      function watchOnce(node, id, title){
        if (!('IntersectionObserver' in window)) { send('promo_impression', id, title); return; }
        var io = new IntersectionObserver(function(es){
          for (var i=0;i<es.length;i++) if (es[i].isIntersecting) { send('promo_impression', id, title); io.disconnect(); }
        }, { threshold: 0.5 });
        io.observe(node);
      }
      function isKorea(){
        try {
          var tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
          return tz === 'Asia/Seoul' || tz === 'Asia/Pyongyang';
        } catch(e){ return false; }   // 판별 실패 시 쿠팡은 접는다(에러 페이지로 보내느니 낫다)
      }
      function money(v){
        var n = String(v||'').replace(/[^0-9]/g,'');
        return n ? Number(n).toLocaleString() + '₫' : (v||'');
      }
      function note(text){
        var p = document.createElement('p');
        p.textContent = text;
        p.style.cssText = 'margin:4px 0 0;text-align:center;font-size:11px;color:#94a3b8;';
        return p;
      }

      // ── 쿠팡 (한국 접속자만) ─────────────────────────────────────
      if (COUPANG_ON && isKorea()) {
        var cbox = document.createElement('div');
        var cw = document.createElement('div');
        cw.style.cssText = 'margin:0 0 4px;overflow-x:auto;';
        var ifr = document.createElement('iframe');
        ifr.src = COUPANG_SRC; ifr.width = 680; ifr.height = 140;
        ifr.title = '쿠팡 추천 상품'; ifr.referrerPolicy = 'unsafe-url';
        ifr.style.cssText = 'border:0;display:block;margin:0 auto;';
        cw.appendChild(ifr);
        cbox.appendChild(cw);
        cbox.appendChild(note('쿠팡 파트너스 활동의 일환으로 이에 따른 일정액의 수수료를 제공받습니다.'));
        cbox.style.cssText = 'margin:0 0 18px;';
        el.appendChild(cbox);
        watchOnce(cbox, 'coupang_carousel', '쿠팡 다이나믹 배너');
      }

      // ── 알리익스프레스 (지역 무관, 항상) ─────────────────────────
      window.__xcShop = window.__xcShop || {};
      var p = window.__xcShop[API] || (window.__xcShop[API] = fetch(API, { credentials:'omit' }).then(function(r){ return r.json(); }));
      p.then(function(d){
        var items = ((d && d.products) || []).slice(0, LIMIT);
        if (!items.length) return;

        var sec = document.createElement('div');

        var head = document.createElement('div');
        head.style.cssText = 'margin-bottom:10px;';
        head.innerHTML = '<div style="font-size:15px;font-weight:800;color:#1e293b;">🛍️ 알리익스프레스 인기 상품</div>'
                       + '<div style="font-size:12px;color:#64748b;">해외직구 · 오늘의 특가</div>';
        sec.appendChild(head);

        var strip = document.createElement('div');
        strip.style.cssText = 'display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;-webkit-overflow-scrolling:touch;';

        items.forEach(function(it){
          var a = document.createElement('a');
          a.href = it.url || '#'; a.target = '_blank'; a.rel = 'noopener sponsored';
          a.style.cssText = 'flex:0 0 150px;width:150px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;text-decoration:none;color:#334155;';

          var box = document.createElement('div');
          box.style.cssText = 'position:relative;width:150px;height:150px;background:#f8fafc;';
          var img = document.createElement('img');
          img.src = it.image; img.alt = it.title || ''; img.loading = 'lazy';
          img.style.cssText = 'width:150px;height:150px;object-fit:cover;display:block;';
          box.appendChild(img);
          if (it.discount) {
            var tag = document.createElement('span');
            tag.textContent = '-' + it.discount;
            tag.style.cssText = 'position:absolute;left:6px;top:6px;background:#e62e04;color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:6px;';
            box.appendChild(tag);
          }
          a.appendChild(box);

          var body = document.createElement('div');
          body.style.cssText = 'padding:7px;';
          var t = document.createElement('div');
          t.textContent = it.title || '';
          t.style.cssText = 'font-size:11px;line-height:1.35;height:30px;overflow:hidden;color:#475569;';
          body.appendChild(t);
          var pr = document.createElement('div');
          pr.textContent = money(it.price);
          pr.style.cssText = 'margin-top:3px;font-size:13px;font-weight:800;color:#e62e04;';
          body.appendChild(pr);
          if (it.origPrice) {
            var op = document.createElement('div');
            op.textContent = money(it.origPrice);
            op.style.cssText = 'font-size:10px;color:#94a3b8;text-decoration:line-through;';
            body.appendChild(op);
          }
          a.appendChild(body);

          a.addEventListener('click', function(){ send('promo_click', 'ali_' + (it.id||''), it.title||''); });
          strip.appendChild(a);
        });

        sec.appendChild(strip);
        sec.appendChild(note('제휴 링크입니다. 클릭·구매 시 씬짜오 운영에 도움이 됩니다. (구매 가격은 동일합니다.)'));
        el.appendChild(sec);
        watchOnce(sec, 'ali_carousel', '알리익스프레스 캐러셀');
      }).catch(function(){ /* 상품을 못 받으면 조용히 넘어간다 — 빈 공간을 남기지 않는다 */ });
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
 *   본문 상단에 top 1개 → 매 N단락마다 in-content(우선순위 위→아래) → 본문 끝에 bottom 1개.
 * wpautop(우선순위 10) 이후 동작하도록 the_content 우선순위 20. 렌더된 HTML 직접 삽입.
 */
function xinchao_inject_body_ads($content) {
    if (!XINCHAO_BODY_ENABLED) return $content;
    if (is_admin()) return $content;
    if (!is_singular('post') || !in_the_loop() || !is_main_query()) return $content;

    $top    = xinchao_render_ad('detail', 'top', 0, XINCHAO_BODY_MAX);
    $bottom = xinchao_render_ad('detail', 'bottom', 0, XINCHAO_BODY_MAX);

    $paragraphs = explode('</p>', $content);
    $count = count($paragraphs);

    // 단락이 거의 없으면 상단 + 하단만
    if ($count < 2) {
        return $top . $content . $bottom;
    }

    $body = '';
    $slot = 0; // 중간(in-content) 슬롯 순번 = 우선순위 순번
    foreach ($paragraphs as $index => $para) {
        if (trim($para) === '') { $body .= $para; continue; }
        $body .= $para . '</p>';
        $paraNo = $index + 1;
        // 매 N단락 뒤(마지막 단락 뒤엔 넣지 않음 — 하단 슬롯이 따로 들어감)
        if (($paraNo % XINCHAO_BODY_EVERY) === 0 && $index < $count - 1) {
            $body .= xinchao_render_ad('detail', 'in-content', $slot++, XINCHAO_BODY_MAX);
        }
    }

    return $top . $body . $bottom;
}
add_filter('the_content', 'xinchao_inject_body_ads', 20);

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
