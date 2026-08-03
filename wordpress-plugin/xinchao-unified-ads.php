<?php
/**
 * Plugin Name: XinChao 통합 광고 (Unified Ads)
 * Description: 통합 광고센터(ads_unified)의 chaovietnam 지면 광고를 공개 API로 불러와 표시한다. Ad Inserter 등에 [xinchao_ad] 숏코드로 삽입. (Ad Inserter = 어디에 넣을지 / 이 숏코드 = 무엇을 보여줄지)
 * Version: 1.0.0
 * Author: XinChao
 *
 * 사용법:
 *   [xinchao_ad]                     → 전체(page 필터 없음) 중 우선순위 1등 광고
 *   [xinchao_ad page="home"]         → 홈 대상 광고
 *   [xinchao_ad page="news-terminal"]→ 뉴스 터미날 대상
 *   [xinchao_ad page="detail"]       → 기사 상세 대상
 *   [xinchao_ad n="1"]               → 우선순위 2등(0부터). 한 페이지에 여러 슬롯 넣을 때.
 *
 * 데이터 출처: https://daily-news-final.vercel.app/api/public/ads  (CORS 허용, 1분 캐시)
 * 광고가 없으면 아무것도 표시하지 않는다(빈 공간 없음).
 */

if (!defined('ABSPATH')) exit;

define('XINCHAO_UNIFIED_ADS_API', 'https://daily-news-final.vercel.app/api/public/ads');

function xinchao_unified_ads_shortcode($atts) {
    $a = shortcode_atts(array(
        'page' => '',   // '' | home | news-terminal | detail
        'n'    => '0',  // 우선순위 순번(0=1등)
        'max'  => '728' // 최대 폭(px)
    ), $atts, 'xinchao_ad');

    $uid  = 'xcad_' . wp_generate_password(8, false, false);
    $api  = esc_js(XINCHAO_UNIFIED_ADS_API);
    $page = esc_js($a['page']);
    $n    = intval($a['n']);
    $max  = intval($a['max']);

    ob_start();
    ?>
    <div id="<?php echo esc_attr($uid); ?>" class="xinchao-ad" style="max-width:<?php echo $max; ?>px;margin:12px auto;text-align:center;"></div>
    <script>
    (function(){
      var el = document.getElementById(<?php echo json_encode($uid); ?>);
      if (!el) return;
      var page = <?php echo json_encode($page); ?>;
      var n = <?php echo (int)$n; ?>;
      var url = <?php echo json_encode($api); ?> + (page ? ('?page=' + encodeURIComponent(page)) : '');
      fetch(url, { credentials: 'omit' })
        .then(function(r){ return r.json(); })
        .then(function(d){
          var ads = (d && d.ads) || [];
          var ad = ads[n];
          if (!ad || !ad.imageUrl) { el.style.display = 'none'; return; }
          var a = document.createElement('a');
          a.href = ad.linkUrl || '#';
          a.target = '_blank';
          a.rel = 'noopener sponsored';
          a.setAttribute('aria-label', ad.title || '광고');
          a.style.display = 'block';
          var img = document.createElement('img');
          img.src = ad.imageUrl;
          img.alt = ad.title || '';
          img.loading = 'lazy';
          img.style.cssText = 'display:block;width:100%;height:auto;border-radius:8px;';
          a.appendChild(img);
          el.appendChild(a);
        })
        .catch(function(){ el.style.display = 'none'; });
    })();
    </script>
    <?php
    return ob_get_clean();
}
add_shortcode('xinchao_ad', 'xinchao_unified_ads_shortcode');
