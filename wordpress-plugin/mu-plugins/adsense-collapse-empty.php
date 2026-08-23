<?php
/**
 * Plugin Name: 애드센스 빈 광고 자리 접기
 * Description: 광고가 채워지지 않은(unfilled) 애드센스 자리를 감춰 화면에 빈 공백이 남지 않게 한다.
 *
 *              왜 필요한가 (2026-08-23 실측):
 *                홈에서 애드센스 자리(ins)가 10개 잡히는데 실제로 채워지는 것은 1~3개였다.
 *                나머지는 크기만 차지한 채 비어 있어 화면 한가운데 큰 공백으로 보인다.
 *                사장님이 "광고가 안 뜬다"고 보신 것이 이 빈칸이다.
 *                광고 자체는 정상 게재 중이며(수익 발생 확인), 재고가 없는 자리만 비는 것이다.
 *
 *              왜 이렇게 되나:
 *                애드센스는 화면 밖(뷰포트 밖) 자리만 스스로 접는다. 화면 안의 자리를 접으면
 *                내용이 갑자기 위로 밀려 올라가(page reflow) 읽던 자리를 잃기 때문이다.
 *                그래서 화면 안의 빈 자리는 크기를 유지한 채 공백으로 남긴다.
 *                이걸 접는 것은 게시자 몫이고, 구글이 공식 문서에서 안내하는 방법이 아래 CSS 다.
 *                (support.google.com/adsense/answer/10762946)
 *
 *              동작 방식:
 *                애드센스는 광고 요청 결과에 따라 ins 태그에 data-ad-status="filled|unfilled" 를 붙인다.
 *                unfilled 인 것만 감춘다 → 아직 로딩 중인 자리는 건드리지 않으므로,
 *                광고가 늦게 들어와도 정상적으로 나타난다.
 *                자동 광고가 만드는 래퍼(.google-auto-placed)는 안이 비면 함께 접는다 —
 *                ins 만 감추면 래퍼의 여백이 그대로 남기 때문이다.
 *
 *              ⚠️ 광고를 클릭하도록 유도하거나 가리는 것이 아니라, 빈 자리를 정리하는 것이므로
 *                 애드센스 정책에 어긋나지 않는다. 채워진 광고는 그대로 보인다.
 *
 * Author: chaovietnam ops
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

function xinchao_collapse_empty_ads()
{
    if (is_admin()) {
        return;
    }
    ?>
    <style id="xinchao-ad-collapse">
    /* 구글 공식 권장: 채워지지 않은 광고 자리는 감춘다 */
    ins.adsbygoogle[data-ad-status="unfilled"] { display: none !important; }
    /* 자동 광고 래퍼가 빈 채로 여백만 남기는 경우 */
    .google-auto-placed.xinchao-ad-empty { display: none !important; }
    </style>
    <script data-no-optimize="1" data-no-defer="1" data-cfasync="false">
    (function () {
      // ins 를 감춰도 그것을 감싼 자동광고 래퍼의 여백은 남는다.
      // 래퍼 안에 '보이는 광고'가 하나도 없으면 래퍼째 접는다.
      function sweep() {
        var wraps = document.querySelectorAll('.google-auto-placed');
        for (var i = 0; i < wraps.length; i++) {
          var w = wraps[i];
          var live = w.querySelector('ins.adsbygoogle:not([data-ad-status="unfilled"])');
          if (live) {
            w.classList.remove('xinchao-ad-empty');   // 늦게 채워지면 되살린다
          } else if (w.querySelector('ins.adsbygoogle[data-ad-status="unfilled"]')) {
            w.classList.add('xinchao-ad-empty');
          }
        }
      }

      // 애드센스는 data-ad-status 를 광고 응답이 온 뒤에 붙인다 → 속성 변화를 지켜본다.
      try {
        var mo = new MutationObserver(sweep);
        mo.observe(document.documentElement, {
          subtree: true, childList: true,
          attributes: true, attributeFilter: ['data-ad-status']
        });
      } catch (e) {}

      // 관찰자를 못 쓰는 환경 대비 + 첫 렌더 직후 한 번씩
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', sweep);
      } else {
        sweep();
      }
      setTimeout(sweep, 2000);
      setTimeout(sweep, 5000);
    })();
    </script>
    <?php
}
add_action('wp_head', 'xinchao_collapse_empty_ads', 99);
