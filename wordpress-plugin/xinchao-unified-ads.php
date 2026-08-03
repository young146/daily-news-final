<?php
/**
 * Plugin Name: XinChao 통합 광고 (Unified Ads)
 * Description: 통합 광고센터(ads_unified)의 chaovietnam 지면 광고를 공개 API로 불러와 표시한다. 기사 본문에 위치별 자동 삽입 — 상단(1) + 중간(매 N단락마다) + 하단(1). 사이드바는 [xinchao_ad slot="sidebar"] 숏코드. Advanced Ads/Ad Inserter 불필요. 직원은 통합센터에서 등록만 하면 되고, 위치는 우선순위로 자동 결정.
 * Version: 3.2.0
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
      function make(ad){
        if (!ad || !ad.imageUrl) return null;
        var a = document.createElement('a');
        a.href = ad.linkUrl || '#'; a.target = '_blank'; a.rel = 'noopener sponsored';
        a.setAttribute('aria-label', ad.title || '광고'); a.style.display = 'block'; a.style.marginBottom = '14px';
        var img = document.createElement('img');
        img.src = ad.imageUrl; img.alt = ad.title || ''; img.loading = 'lazy';
        img.style.cssText = 'display:block;width:100%;height:auto;border-radius:8px;';
        a.appendChild(img); return a;
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
