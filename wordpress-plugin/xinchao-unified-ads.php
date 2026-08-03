<?php
/**
 * Plugin Name: XinChao 통합 광고 (Unified Ads)
 * Description: 통합 광고센터(ads_unified)의 chaovietnam 지면 광고를 공개 API로 불러와 표시한다. 기사 본문에 위치별 자동 삽입 — 상단(1) + 중간(매 N단락마다) + 하단(1). 사이드바는 [xinchao_ad slot="sidebar"] 숏코드. Advanced Ads/Ad Inserter 불필요. 직원은 통합센터에서 등록만 하면 되고, 위치는 우선순위로 자동 결정.
 * Version: 3.0.0
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
 * 광고 슬롯 1개의 HTML(컨테이너 + 로드 스크립트).
 * 같은 page URL 은 한 번만 fetch, 모든 슬롯이 공유(window.__xcAd). 클라이언트에서 위치(slot)로 거르고 n(우선순위 순번)으로 1개 선택.
 *
 * @param string $page  '' | home | news-terminal | detail  (API page 필터)
 * @param string $slot  '' | top | in-content | bottom | sidebar  (위치 필터. ''=전체)
 * @param int    $n     우선순위 순번(0=1등)
 * @param int    $max   최대 폭(px)
 */
function xinchao_render_ad($page = '', $slot = '', $n = 0, $max = 728) {
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
      var n = <?php echo (int)$n; ?>;
      window.__xcAd = window.__xcAd || {};
      var p = window.__xcAd[url] || (window.__xcAd[url] = fetch(url, { credentials: 'omit' }).then(function(r){ return r.json(); }));
      p.then(function(d){
        var ads = (d && d.ads) || [];
        if (slot) ads = ads.filter(function(a){ return a.slot === slot; });
        var ad = ads[n];
        if (!ad || !ad.imageUrl) { el.style.display = 'none'; return; }
        var a = document.createElement('a');
        a.href = ad.linkUrl || '#'; a.target = '_blank'; a.rel = 'noopener sponsored';
        a.setAttribute('aria-label', ad.title || '광고'); a.style.display = 'block';
        var img = document.createElement('img');
        img.src = ad.imageUrl; img.alt = ad.title || ''; img.loading = 'lazy';
        img.style.cssText = 'display:block;width:100%;height:auto;border-radius:8px;';
        a.appendChild(img); el.appendChild(a);
      }).catch(function(){ el.style.display = 'none'; });
    })();
    </script>
    <?php
    return ob_get_clean();
}

/** [xinchao_ad slot="sidebar" page="" n="" max=""] — 특정 위치(위젯/페이지) 수동 삽입용 */
function xinchao_unified_ads_shortcode($atts) {
    $a = shortcode_atts(array('page' => '', 'slot' => '', 'n' => '0', 'max' => '728'), $atts, 'xinchao_ad');
    return xinchao_render_ad($a['page'], $a['slot'], intval($a['n']), intval($a['max']));
}
add_shortcode('xinchao_ad', 'xinchao_unified_ads_shortcode');

// 텍스트 위젯에서도 [xinchao_ad] 숏코드가 실행되게(사이드바 등)
add_filter('widget_text_content', 'do_shortcode', 11);

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
