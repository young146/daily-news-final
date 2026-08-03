<?php
/**
 * Plugin Name: XinChao 통합 광고 (Unified Ads)
 * Description: 통합 광고센터(ads_unified)의 chaovietnam 지면 광고를 공개 API로 불러와 표시한다. 기사 본문에는 자동 삽입(매 N단락 뒤 + 본문 끝), 그 외 위치는 [xinchao_ad] 숏코드. Advanced Ads/Ad Inserter 없이도 동작. (직원은 통합센터에서 등록만 하면 됨)
 * Version: 2.0.0
 * Author: XinChao
 *
 * ── 어떻게 쓰나 ──
 * 1) 기사 본문: 자동. (아래 XINCHAO_BODY_EVERY 마다 + 본문 끝에 자동 삽입) → 워드프레스에서 할 일 없음.
 * 2) 사이드바 등 특정 위치: '텍스트' 위젯에 [xinchao_ad max="300"] 처럼 숏코드 삽입.
 *
 * ── 숏코드 옵션 ──
 *   [xinchao_ad]                      → 우선순위 1등
 *   [xinchao_ad page="detail"]        → 기사 상세 대상 광고
 *   [xinchao_ad n="1"]                → 우선순위 2등(0부터)
 *   [xinchao_ad max="300"]            → 최대 폭 300px (사이드바용 세로 광고)
 *
 * 데이터: https://daily-news-final.vercel.app/api/public/ads  (CORS 허용, 1분 캐시)
 * 광고가 없는 슬롯은 아무것도 표시하지 않는다(빈 공간 없음).
 */

if (!defined('ABSPATH')) exit;

define('XINCHAO_UNIFIED_ADS_API', 'https://daily-news-final.vercel.app/api/public/ads');

// ── 기사 본문 자동 삽입 설정 (여기 숫자만 바꾸면 됨) ──
define('XINCHAO_BODY_EVERY', 2);   // 몇 단락마다 광고 슬롯을 넣을지
define('XINCHAO_BODY_MAX', 728);   // 본문 광고 최대 폭(px)
define('XINCHAO_BODY_ENABLED', true); // 본문 자동삽입 on/off

/**
 * 광고 슬롯 1개의 HTML 을 만든다(컨테이너 + 로드 스크립트).
 * 같은 URL 은 한 번만 fetch 하고 모든 슬롯이 공유(window.__xcAd 캐시).
 * page 대상, n = 우선순위 순번(0=1등), max = 최대 폭(px).
 */
function xinchao_render_ad($page = '', $n = 0, $max = 728) {
    $uid  = 'xcad_' . wp_generate_password(8, false, false);
    $api  = XINCHAO_UNIFIED_ADS_API;
    $url  = $api . ($page ? ('?page=' . rawurlencode($page)) : '');

    ob_start();
    ?>
    <div id="<?php echo esc_attr($uid); ?>" class="xinchao-ad" style="max-width:<?php echo (int)$max; ?>px;margin:14px auto;text-align:center;"></div>
    <script>
    (function(){
      var el = document.getElementById(<?php echo json_encode($uid); ?>);
      if (!el) return;
      var url = <?php echo json_encode($url); ?>;
      var n = <?php echo (int)$n; ?>;
      window.__xcAd = window.__xcAd || {};
      var p = window.__xcAd[url] || (window.__xcAd[url] = fetch(url, { credentials: 'omit' }).then(function(r){ return r.json(); }));
      p.then(function(d){
        var ads = (d && d.ads) || [];
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

/** [xinchao_ad] 숏코드 → 특정 위치(위젯/페이지)에 수동 삽입용 */
function xinchao_unified_ads_shortcode($atts) {
    $a = shortcode_atts(array('page' => '', 'n' => '0', 'max' => '728'), $atts, 'xinchao_ad');
    return xinchao_render_ad($a['page'], intval($a['n']), intval($a['max']));
}
add_shortcode('xinchao_ad', 'xinchao_unified_ads_shortcode');

// 텍스트 위젯에서도 [xinchao_ad] 숏코드가 실행되게(사이드바 등)
add_filter('widget_text_content', 'do_shortcode', 11);

/**
 * 기사 본문 자동 삽입 — 단일 글(post) 본문에 매 XINCHAO_BODY_EVERY 단락 뒤 + 본문 끝에 광고 슬롯.
 * 슬롯마다 우선순위 순번(index)을 위→아래로 부여 → 위 슬롯부터 우선순위 높은 광고가 채워지고
 * 광고가 모자라면 아래 슬롯은 자동으로 빈다(도배 방지).
 * wpautop(우선순위 10) 이후에 동작하도록 the_content 우선순위 20. 렌더된 HTML 을 직접 삽입.
 */
function xinchao_inject_body_ads($content) {
    if (!XINCHAO_BODY_ENABLED) return $content;
    if (is_admin()) return $content;
    if (!is_singular('post') || !in_the_loop() || !is_main_query()) return $content;

    $paragraphs = explode('</p>', $content);
    $count = count($paragraphs);

    // 단락이 거의 없으면 본문 끝에만 1개
    if ($count < 2) {
        return $content . xinchao_render_ad('detail', 0, XINCHAO_BODY_MAX);
    }

    $out = '';
    $slot = 0;
    foreach ($paragraphs as $index => $para) {
        if (trim($para) === '') { $out .= $para; continue; }
        $out .= $para . '</p>';
        $paraNo = $index + 1;
        // 매 N단락 뒤(단, 마지막 단락 뒤엔 넣지 않음 — 끝 슬롯이 따로 들어감)
        if (($paraNo % XINCHAO_BODY_EVERY) === 0 && $index < $count - 1) {
            $out .= xinchao_render_ad('detail', $slot++, XINCHAO_BODY_MAX);
        }
    }
    // 본문 끝 슬롯
    $out .= xinchao_render_ad('detail', $slot++, XINCHAO_BODY_MAX);
    return $out;
}
add_filter('the_content', 'xinchao_inject_body_ads', 20);
