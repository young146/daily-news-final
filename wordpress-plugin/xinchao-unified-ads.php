<?php
/**
 * Plugin Name: XinChao 통합 광고 (Unified Ads)
 * Description: 통합 광고센터(ads_unified)의 chaovietnam 지면 광고를 공개 API로 불러와 표시한다. 기사 본문에 위치별 자동 삽입 — 상단(1) + 중간(매 N단락마다) + 하단(1). 사이드바는 [xinchao_ad slot="sidebar"] 숏코드. Advanced Ads/Ad Inserter 불필요. 직원은 통합센터에서 등록만 하면 되고, 위치는 우선순위로 자동 결정.
 * Version: 4.2.0
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
    $note = 'margin:4px 0 0;text-align:center;font-size:11px;color:#94a3b8;';

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
          var f = document.createElement('iframe');
          f.src = <?php echo json_encode(XINCHAO_COUPANG_WIDGET); ?>;
          f.width = 680; f.height = 140; f.title = '쿠팡 추천 상품';
          f.referrerPolicy = 'unsafe-url'; f.scrolling = 'no';
          f.style.cssText = 'border:0;display:block;margin:0 auto;';
          box.querySelector('.xcshop-coupang-frame').appendChild(f);
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
