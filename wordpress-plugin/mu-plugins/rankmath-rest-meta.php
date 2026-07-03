<?php
/**
 * Plugin Name: Rank Math REST Meta + OG description sync
 * Description: (1) rank_math_title / rank_math_description / rank_math_focus_keyword 를 WordPress REST API에
 *                  노출해, 데일리뉴스 발행/백필 스크립트(app-password 인증)가 SEO 메타를 세팅할 수 있게 함.
 *                  기본 Rank Math는 REST 미노출이라 REST로 못 씀. 쓰기 권한은 edit_posts 로 제한.
 *              (2) 소셜 공유(og/twitter) 설명을 rank_math_description 으로 강제 동기화.
 *                  기본 Rank Math는 og 설명을 본문 앞부분에서 자동생성 → 본문 맨 앞의 "출처: … 날짜: …"
 *                  군더더기가 소셜 공유문에 딸려나오던 문제를 해결. rank_math_description 하나만 세팅하면
 *                  구글 검색 설명과 소셜 공유 설명이 동시에 깔끔해진다.
 * Author: chaovietnam ops
 * Version: 1.1.0
 */

if (!defined('ABSPATH')) {
    exit; // 직접 접근 차단
}

// (1) Rank Math 메타를 REST에 노출 (edit_posts 권한자만 쓰기)
add_action('init', function () {
    $keys = ['rank_math_title', 'rank_math_description', 'rank_math_focus_keyword'];
    foreach ($keys as $key) {
        register_post_meta('post', $key, [
            'type'          => 'string',
            'single'        => true,
            'show_in_rest'  => true,
            'auth_callback' => function () {
                return current_user_can('edit_posts');
            },
        ]);
    }
});

// (2) 소셜(og/twitter) 설명을 rank_math_description 으로 강제 (설정돼 있을 때만).
//     Rank Math 의 opengraph 설명 필터를 가로채, 본문 자동생성("출처…") 대신 우리가 넣은 깔끔한 설명 사용.
function chaovn_og_description_from_rankmath($description) {
    if (!is_singular('post')) {
        return $description;
    }
    $id = get_queried_object_id();
    if (!$id) {
        return $description;
    }
    $rm = get_post_meta($id, 'rank_math_description', true);
    return !empty($rm) ? $rm : $description;
}
add_filter('rank_math/opengraph/facebook/description', 'chaovn_og_description_from_rankmath', 99);
add_filter('rank_math/opengraph/twitter/description', 'chaovn_og_description_from_rankmath', 99);
