<?php
/**
 * Plugin Name: LiteSpeed 최적화 제외 — 광고·분석 스크립트
 * Description: 애드센스·GA4·쿠팡 위젯 등 "수익과 측정에 직결되는" 외부 스크립트를 LiteSpeed 의
 *              JS 최적화(합치기)·지연(defer/delay)·게스트모드 대상에서 제외한다.
 *
 *              왜 필요한가 (2026-08-23 실측):
 *                애드센스 스크립트가 페이지에 이렇게 나가고 있었다 —
 *                  <script type="litespeed/javascript"
 *                          data-src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?...">
 *                `type` 이 브라우저가 실행하지 않는 값으로 바뀌고 `src` 가 `data-src` 로 옮겨져,
 *                스크립트 파일 요청 자체가 나가지 않았다. 헤드리스 Chrome 으로 홈·기사 페이지를
 *                렌더해 네트워크를 잡아보니 adsbygoogle.js 요청 0건, 광고 요청 0건, 광고 자리 0개.
 *                = 애드센스가 전혀 게재되지 않는 상태였다.
 *
 *              왜 설정이 아니라 코드인가:
 *                LiteSpeed 설정 화면에서도 같은 제외를 넣을 수 있지만, 설정은 초기화·플러그인 재설치·
 *                프리셋 적용 때 날아간다. 그때마다 광고가 조용히 멈추고, 멈춘 줄도 모른다.
 *                mu-plugins 는 항상 자동 활성화되고 관리화면에서 끌 수 없으므로 이 조합이 안전하다.
 *
 *              성능 영향:
 *                제외한 만큼 그 스크립트들은 원래대로 로드된다(지연 없음). 광고·분석은 애초에
 *                지연시키면 안 되는 것들이라 의도한 맞바꿈이다. 나머지 스크립트 최적화는 그대로 동작한다.
 *
 *              필터 3종은 LiteSpeed 공식 API 문서 기준:
 *                litespeed_optimize_js_excludes  — JS 최적화(합치기/최소화) 제외
 *                litespeed_optm_js_defer_exc     — JS 지연(defer/delay) 제외
 *                litespeed_optm_gm_js_exc        — 게스트 모드 JS 제외
 *
 * Author: chaovietnam ops
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * 제외 대상 — 부분 문자열로 매칭된다(와일드카드 없음).
 * 새 광고·분석 도구를 붙이면 여기 한 줄만 추가하면 된다.
 */
function xinchao_ls_ad_exclude_list()
{
    return array(
        // ── 애드센스 (수익 직결) ─────────────────────────────
        'googlesyndication.com',   // adsbygoogle.js · 광고 요청
        'adsbygoogle',             // 인라인 초기화 코드
        'googletagservices.com',   // GPT(광고 태그)

        // ── 측정 (이게 지연되면 유입 통계가 어긋난다) ────────
        'googletagmanager.com',    // GA4 · Site Kit
        'google-analytics.com',

        // ── 제휴 위젯 ────────────────────────────────────────
        'ads-partners.coupang.com', // 쿠팡 파트너스 다이나믹 배너

        // ── 우리 통합 광고센터 ───────────────────────────────
        // 슬롯 스크립트에 data-no-optimize 를 이미 달아두었지만,
        // LiteSpeed 설정이 바뀌어도 확실히 살아있도록 이중으로 건다.
        'daily-news-final.vercel.app',
    );
}

/**
 * 세 필터에 같은 목록을 붙인다.
 * 배열이 아닌 값이 넘어오는 경우(다른 플러그인 간섭)에도 깨지지 않게 방어한다.
 */
function xinchao_ls_merge_excludes($excludes)
{
    if (!is_array($excludes)) {
        $excludes = array();
    }
    return array_values(array_unique(array_merge($excludes, xinchao_ls_ad_exclude_list())));
}

add_filter('litespeed_optimize_js_excludes', 'xinchao_ls_merge_excludes');
add_filter('litespeed_optm_js_defer_exc', 'xinchao_ls_merge_excludes');
add_filter('litespeed_optm_gm_js_exc', 'xinchao_ls_merge_excludes');
