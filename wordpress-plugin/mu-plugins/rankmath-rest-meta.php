<?php
/**
 * Plugin Name: Rank Math REST Meta – expose SEO fields to REST
 * Description: rank_math_title / rank_math_description / rank_math_focus_keyword 를 WordPress REST API에
 *              노출해, 데일리뉴스 발행 스크립트(app-password 인증)가 발행/백필 시 SEO 메타를 직접
 *              세팅할 수 있게 합니다. 기본 Rank Math는 이 메타를 REST에 열지 않아 REST로 못 씀.
 *              쓰기 권한은 edit_posts 보유자로 제한.
 * Author: chaovietnam ops
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit; // 직접 접근 차단
}

add_action('init', function () {
    $keys = ['rank_math_title', 'rank_math_description', 'rank_math_focus_keyword'];
    foreach ($keys as $key) {
        register_post_meta('post', $key, [
            'type'          => 'string',
            'single'        => true,
            'show_in_rest'  => true,
            // 편집 권한자만 쓰기 가능(발행 계정=app password는 edit_posts 보유)
            'auth_callback' => function () {
                return current_user_can('edit_posts');
            },
        ]);
    }
});
