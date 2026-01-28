<?php
/**
 * ============================================================================
 * Sahifa Child Theme - Complete Functions (PRODUCTION VERSION)
 * ============================================================================
 * 
 * 포함 기능:
 * 1. 부모 테마 스타일 로드
 * 2. 홈페이지 성능 최적화 시스템
 * 3. Daily News Terminal 성능 최적화 시스템
 * 
 * 테스트용 함수 제거됨 - 프로덕션 사용 가능
 * 
 * ⚠️ 참고: 이 파일은 chaovietnam.co.kr 자식 테마의 functions.php 복사본입니다.
 *         실제 서버 파일과 동기화가 필요할 수 있습니다.
 */


// ============================================================================
// 1. 부모 테마 스타일 불러오기
// ============================================================================
function sahifa_child_enqueue_styles() {
    wp_enqueue_style('parent-style', get_template_directory_uri() . '/style.css');
}
add_action('wp_enqueue_scripts', 'sahifa_child_enqueue_styles');


// ============================================================================
// 2. 홈페이지 성능 최적화 시스템
// ============================================================================

// ========================================
// 2-1. 커스텀 Cron 스케줄
// ========================================
function chaovietnam_cron_schedules($schedules) {
    $schedules['every_10_minutes'] = array(
        'interval' => 600,
        'display'  => __('10분마다')
    );
    
    return $schedules;
}
add_filter('cron_schedules', 'chaovietnam_cron_schedules');


// ========================================
// 2-2. 홈페이지 섹션별 데이터 캐싱
// ========================================

function cache_homepage_sections_data() {
    $base_args = array(
        'update_post_meta_cache' => false,
        'update_post_term_cache' => false,
        'no_found_rows' => true,
        'ignore_sticky_posts' => true
    );
    
    $sections = array(
        array('key' => 'daily_news', 'category' => 'daily-news', 'count' => 10),
        array('key' => 'korean_news', 'category' => 'korean-news', 'count' => 8),
        array('key' => 'xinchao_biz', 'category' => 'xinchao-biz', 'count' => 8),
        array('key' => 'column', 'category' => 'column', 'count' => 6),
        array('key' => 'fnb', 'category' => 'fnb', 'count' => 8),
        array('key' => 'golf_sports', 'category' => 'golf-sports', 'count' => 6),
        array('key' => 'xinchao_edu', 'category' => 'xinchao-edu', 'count' => 6),
        array('key' => 'life_joy_travel', 'category' => 'life-joy-travel', 'count' => 8)
    );
    
    foreach ($sections as $section) {
        $query_args = array_merge($base_args, array(
            'post_type' => 'post',
            'posts_per_page' => $section['count'],
            'orderby' => 'date',
            'order' => 'DESC',
            'category_name' => $section['category']
        ));
        
        $query = new WP_Query($query_args);
        $posts_data = array();
        
        if ($query->have_posts()) {
            while ($query->have_posts()) {
                $query->the_post();
                $posts_data[] = array(
                    'id' => get_the_ID(),
                    'title' => get_the_title(),
                    'excerpt' => get_the_excerpt(),
                    'url' => get_permalink(),
                    'date' => get_the_date(),
                    'thumbnail' => get_the_post_thumbnail_url(get_the_ID(), 'medium'),
                );
            }
        }
        wp_reset_postdata();
        
        set_transient('home_section_' . $section['key'], $posts_data, 10 * MINUTE_IN_SECONDS);
    }
}


// ========================================
// 2-3. 데이터 조회 헬퍼 함수들
// ========================================

function get_homepage_section($section_key) {
    $cache_key = 'home_section_' . $section_key;
    return get_transient($cache_key) ?: array();
}

function get_daily_news() { return get_homepage_section('daily_news'); }
function get_korean_news() { return get_homepage_section('korean_news'); }
function get_xinchao_biz() { return get_homepage_section('xinchao_biz'); }
function get_column() { return get_homepage_section('column'); }
function get_fnb() { return get_homepage_section('fnb'); }
function get_golf_sports() { return get_homepage_section('golf_sports'); }
function get_xinchao_edu() { return get_homepage_section('xinchao_edu'); }
function get_life_joy_travel() { return get_homepage_section('life_joy_travel'); }


// ========================================
// 2-4. Cron 작업 등록
// ========================================

function schedule_homepage_cache_update() {
    if (!wp_next_scheduled('cron_cache_homepage_sections')) {
        wp_schedule_event(time(), 'every_10_minutes', 'cron_cache_homepage_sections');
    }
}
add_action('wp', 'schedule_homepage_cache_update');
add_action('cron_cache_homepage_sections', 'cache_homepage_sections_data');


// ========================================
// 2-5. 초기 데이터 로딩
// ========================================

function initial_homepage_cache() {
    if (get_transient('home_section_daily_news') === false) {
        cache_homepage_sections_data();
    }
}
add_action('init', 'initial_homepage_cache', 1);


// ========================================
// 2-6. 관리자 도구
// ========================================

function add_cache_refresh_button($wp_admin_bar) {
    if (!current_user_can('manage_options')) {
        return;
    }
    
    $wp_admin_bar->add_node(array(
        'id' => 'refresh_homepage_cache',
        'title' => '🔄 전체 캐시 갱신',
        'href' => admin_url('admin-ajax.php?action=manual_refresh_all_cache'),
    ));
}
add_action('admin_bar_menu', 'add_cache_refresh_button', 100);

add_action('wp_ajax_manual_refresh_all_cache', function() {
    cache_homepage_sections_data();
    update_weather_data_background();
    update_exchange_rates_background();
    
    wp_redirect(add_query_arg('cache_refreshed', 1, wp_get_referer()));
    exit;
});


// ============================================================================
// 3. Daily News Terminal 성능 최적화 시스템
// ============================================================================

// ========================================
// 3-1. 날씨 데이터 캐싱
// ========================================

function get_cached_weather_data() {
    $cached = get_transient('weather_data');
    return ($cached !== false && is_array($cached)) ? $cached : array();
}

function update_weather_data_background() {
    $cities = array(
        array('name' => '하노이', 'lat' => 21.0285, 'lon' => 105.8542),
        array('name' => '호치민', 'lat' => 10.8231, 'lon' => 106.6297),
        array('name' => '서울', 'lat' => 37.5665, 'lon' => 126.9780),
    );
    
    $weather_data = array();
    
    foreach ($cities as $city) {
        $url = 'https://api.open-meteo.com/v1/forecast?latitude=' . $city['lat'] . '&longitude=' . $city['lon'] . '&current_weather=true';
        $response = wp_remote_get($url, array('timeout' => 10));
        
        $temp = '--';
        if (!is_wp_error($response)) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (isset($body['current_weather']['temperature'])) {
                $temp = round($body['current_weather']['temperature']) . '°C';
            }
        }
        
        $weather_data[$city['name']] = $temp;
    }
    
    set_transient('weather_data', $weather_data, 10 * MINUTE_IN_SECONDS);
    return $weather_data;
}


// ========================================
// 3-2. 환율 데이터 캐싱
// ========================================

function get_cached_exchange_rates() {
    $cached = get_transient('exchange_rates');
    
    if ($cached !== false && is_array($cached)) {
        return $cached;
    }
    
    return array(
        'usd' => '25,400',
        'krw_100' => '1,780',
    );
}

function update_exchange_rates_background() {
    $exchange_data = array(
        'usd' => '25,400',
        'krw_100' => '1,780',
    );
    
    $url = 'https://open.er-api.com/v6/latest/USD';
    $response = wp_remote_get($url, array(
        'timeout' => 10,
        'user-agent' => 'Mozilla/5.0'
    ));
    
    if (!is_wp_error($response)) {
        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (isset($body['rates']) && isset($body['rates']['VND'])) {
            $vnd_rate = floatval($body['rates']['VND']);
            $exchange_data['usd'] = number_format($vnd_rate, 0);
            
            if (isset($body['rates']['KRW'])) {
                $krw_rate = floatval($body['rates']['KRW']);
                if ($krw_rate > 0) {
                    $krw_to_vnd = ($vnd_rate / $krw_rate) * 100;
                    $exchange_data['krw_100'] = number_format($krw_to_vnd, 0);
                }
            }
        }
    }
    
    set_transient('exchange_rates', $exchange_data, 60 * MINUTE_IN_SECONDS);
    return $exchange_data;
}


// ========================================
// 3-3. Cron 작업 등록
// ========================================

function schedule_daily_news_cache_update() {
    if (!wp_next_scheduled('cron_update_weather')) {
        wp_schedule_event(time(), 'every_10_minutes', 'cron_update_weather');
    }
    
    if (!wp_next_scheduled('cron_update_exchange')) {
        wp_schedule_event(time(), 'every_10_minutes', 'cron_update_exchange');
    }
}
add_action('wp', 'schedule_daily_news_cache_update');

add_action('cron_update_weather', 'update_weather_data_background');
add_action('cron_update_exchange', 'update_exchange_rates_background');


// ========================================
// 3-4. 초기 데이터 로딩
// ========================================

function initial_daily_news_cache() {
    if (get_transient('weather_data') === false) {
        update_weather_data_background();
    }
    
    if (get_transient('exchange_rates') === false) {
        update_exchange_rates_background();
    }
}
add_action('init', 'initial_daily_news_cache', 2);

?>
