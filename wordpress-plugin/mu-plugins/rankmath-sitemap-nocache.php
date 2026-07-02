<?php
/**
 * Plugin Name: Rank Math Sitemap – Disable Cache (always fresh)
 * Description: Rank Math 사이트맵 캐시를 비활성화해 매 요청마다 최신 사이트맵을 생성합니다.
 *              대형 뉴스 사이트에서 캐시가 멈춰(freeze) 새 기사가 사이트맵에 안 들어가던
 *              문제(2026-06-15 사례)를 원천 차단합니다. 사이트맵은 하위맵당 200 URL로
 *              분할 생성되므로 캐시가 없어도 성능 영향은 미미합니다.
 * Author: chaovietnam ops
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit; // 직접 접근 차단
}

// 사이트맵 캐시 완전 비활성화 → 항상 최신 생성 (freeze 불가)
add_filter('rank_math/sitemap/enable_caching', '__return_false');
