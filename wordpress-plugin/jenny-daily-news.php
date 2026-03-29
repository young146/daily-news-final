<?php
/**
 * Plugin Name: Jenny Daily News Display
 * Description: Displays daily news in a beautiful card layout using the shortcode [daily_news_list]. Shows excerpt and links to full article. Includes weather and exchange rate info.
 * Version: 2.0.0
 * Author: Jenny (Antigravity)
 */

if (!defined('ABSPATH')) {
    exit;
}

// ============================================================================
// 상수 및 설정값 정의
// ============================================================================

/**
 * 카테고리 순서 정의
 */
function jenny_get_category_order()
{
    return array(
        '사회' => 1,
        'Society' => 1,
        '경제' => 2,
        'Economy' => 2,
        '문화' => 3,
        'Culture' => 3,
        '부동산' => 4,
        'Real Estate' => 4,
        '정치' => 5,
        '정책' => 5,
        'Politics' => 5,
        'Policy' => 5,
        '국제' => 6,
        'International' => 6,
        '한베' => 7,
        '한-베' => 7,
        'Korea-Vietnam' => 7,
        '교민' => 8,
        '교민소식' => 8,
        'Community' => 8,
        '여행' => 9,
        'Travel' => 9,
        '건강' => 10,
        'Health' => 10,
        '음식' => 11,
        'Food' => 11,
        '기타' => 12,
        'Other' => 12,
    );
}

/**
 * 섹션 키 정의
 */
function jenny_get_sections_keys()
{
    return array(
        'economy' => array('Economy', '경제'),
        'society' => array('Society', '사회'),
        'culture' => array('Culture', '문화'),
        'real_estate' => array('Real Estate', '부동산'),
        'politics' => array('Politics', 'Policy', '정치', '정책'),
        'international' => array('International', '국제'),
        'korea_vietnam' => array('Korea-Vietnam', '한-베', '한베'),
        'community' => array('Community', '교민', '교민소식'),
        'travel' => array('Travel', '여행'),
        'health' => array('Health', '건강'),
        'food' => array('Food', '음식'),
        'other' => array('Other', '기타'),
    );
}

/**
 * 카테고리 표시 이름 매핑
 */
function jenny_get_category_map()
{
    return array(
        'Society' => '사회',
        '사회' => '사회',
        'Economy' => '경제',
        '경제' => '경제',
        'Culture' => '문화/스포츠',
        '문화' => '문화/스포츠',
        'Real Estate' => '부동산',
        '부동산' => '부동산',
        'Politics' => '정치/정책',
        'Policy' => '정치/정책',
        '정치' => '정치/정책',
        '정책' => '정치/정책',
        'International' => '국제',
        '국제' => '국제',
        'Korea-Vietnam' => '한-베',
        '한-베' => '한-베',
        '한베' => '한-베',
        'Community' => '교민소식',
        '교민' => '교민소식',
        '교민소식' => '교민소식',
        'Travel' => '여행',
        '여행' => '여행',
        'Health' => '건강',
        '건강' => '건강',
        'Food' => '음식',
        '음식' => '음식',
        'Other' => '기타',
        '기타' => '기타',
    );
}

/**
 * 섹션 정의
 */
function jenny_get_sections()
{
    return array(
        'economy' => array('title' => '📈 경제 (Economy)', 'keys' => array('Economy', '경제')),
        'society' => array('title' => '👥 사회 (Society)', 'keys' => array('Society', '사회')),
        'culture' => array('title' => '🎭 문화/스포츠 (Culture)', 'keys' => array('Culture', '문화')),
        'real_estate' => array('title' => '🏠 부동산 (Real Estate)', 'keys' => array('Real Estate', '부동산')),
        'politics' => array('title' => '⚖️ 정치/정책 (Politics)', 'keys' => array('Politics', 'Policy', '정치', '정책')),
        'international' => array('title' => '🌏 국제 (International)', 'keys' => array('International', '국제')),
        'korea_vietnam' => array('title' => '🇰🇷🇻🇳 한-베 관계 (Korea-Vietnam)', 'keys' => array('Korea-Vietnam', '한-베', '한베')),
        'community' => array('title' => '📢 교민 소식 (Community)', 'keys' => array('Community', '교민', '교민소식')),
        'travel' => array('title' => '✈️ 여행 (Travel)', 'keys' => array('Travel', '여행')),
        'health' => array('title' => '🏥 건강 (Health)', 'keys' => array('Health', '건강')),
        'food' => array('title' => '🍽️ 음식 (Food)', 'keys' => array('Food', '음식')),
        'other' => array('title' => '✨ 기타 (Other)', 'keys' => array('Other', '기타'))
    );
}

/**
 * 섹션 네비게이션 항목 정의
 */
function jenny_get_section_nav_items()
{
    return array(
        'economy' => array('label' => '경제', 'icon' => '📈'),
        'society' => array('label' => '사회', 'icon' => '👥'),
        'culture' => array('label' => '문화/스포츠', 'icon' => '🎭'),
        'real_estate' => array('label' => '부동산', 'icon' => '🏠'),
        'politics' => array('label' => '정치/정책', 'icon' => '⚖️'),
        'international' => array('label' => '국제', 'icon' => '🌏'),
        'korea_vietnam' => array('label' => '한-베', 'icon' => '🇰🇷🇻🇳'),
        'community' => array('label' => '교민소식', 'icon' => '📢'),
        'travel' => array('label' => '여행', 'icon' => '✈️'),
        'health' => array('label' => '건강', 'icon' => '🏥'),
        'food' => array('label' => '음식', 'icon' => '🍽️'),
        'other' => array('label' => '기타', 'icon' => '✨'),
    );
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 본문에서 출처/날짜/원문 정보 제거
 */
function jenny_clean_content($content)
{
    // 1. <style> 태그와 내용을 먼저 제거
    $content = preg_replace('/<style[^>]*>.*?<\/style>/is', '', $content);
    // 2. 나머지 HTML 태그 제거
    $content = strip_tags($content);

    // 3. 출처/날짜/원문 정보 제거 패턴들
    $patterns = array(
        '/출처\s*:\s*[^날]+날짜\s*:\s*[0-9.\s]+\.{0,2}\s*/i',  // 패턴 1: "출처: [소스명] 날짜: [날짜]"
        '/출처\s*:\s*[^|]*\s*\|/i',                            // 패턴 2: "출처: [소스명] |"
        '/날짜\s*:\s*[^|]*\s*\|/i',                            // 패턴 2: "날짜: [날짜] |"
        '/원문\s*(기사\s*)?(전체\s*)?보기[^가-힣a-zA-Z0-9]*/i', // 패턴 3: "원문 보기"
        '/https?:\/\/[^\s]+/i',                                // 패턴 4: URL 제거
        '/\s*[|]\s*/',                                          // 패턴 5: 구분선 제거
        '/\s{2,}/',                                            // 패턴 6: 연속된 공백 정리
    );

    foreach ($patterns as $pattern) {
        $content = preg_replace($pattern, ' ', $content);
    }

    return trim($content);
}

/**
 * 포스트에서 카테고리 추출
 */
function jenny_get_post_category($post_id)
{
    $news_category = get_post_meta($post_id, 'news_category', true);
    if (empty($news_category) || trim($news_category) === '') {
        $categories = get_the_category($post_id);
        $news_category = !empty($categories) ? $categories[0]->name : '뉴스';
    }
    return trim($news_category);
}

/**
 * 카테고리를 섹션 키로 변환
 */
function jenny_get_section_key($category, $sections_keys)
{
    $cat = trim($category);
    foreach ($sections_keys as $sec_key => $keys) {
        if (in_array($cat, $keys, true))
            return $sec_key;
        foreach ($keys as $key) {
            if (strcasecmp($cat, $key) === 0)
                return $sec_key;
        }
    }
    return 'other';
}

/**
 * 카테고리 표시 이름 가져오기
 */
function jenny_get_category_display_name($news_category, $category_map)
{
    $news_category = trim($news_category);
    if (empty($news_category)) {
        return '뉴스';
    }

    // 정확한 매칭 시도
    if (isset($category_map[$news_category])) {
        return $category_map[$news_category];
    }

    // 대소문자 무시 매칭 시도
    foreach ($category_map as $key => $value) {
        if (strcasecmp($news_category, $key) === 0) {
            return $value;
        }
    }

    return $news_category; // 기본값
}

/**
 * 뉴스 카드 렌더링
 */
function jenny_render_news_card($post_data, $category_map)
{
    $post_obj = get_post($post_data['post_id']);
    setup_postdata($post_obj);

    $thumb_url = get_the_post_thumbnail_url($post_data['post_id'], 'medium_large');
    if (!$thumb_url) {
        $thumb_url = 'https://via.placeholder.com/600x400?text=News';
    }

    $cat_name = jenny_get_category_display_name($post_data['category'], $category_map);

    // 요약문 가져오기 (우선순위: 커스텀 필드 > excerpt 필드 > 본문에서 생성)
    // 1. 커스텀 필드에서 요약문 확인 (가장 확실한 방법)
    $excerpt = get_post_meta($post_data['post_id'], 'news_summary', true);

    // 2. 커스텀 필드가 없으면 excerpt 필드 확인
    if (empty($excerpt)) {
        $excerpt = trim($post_obj->post_excerpt);
    }

    // 3. excerpt도 없으면 본문에서 생성
    if (empty($excerpt)) {
        $content = jenny_clean_content($post_obj->post_content);
        if (!empty($content)) {
            $excerpt = wp_trim_words($content, 50, '...');
            // excerpt에서도 한 번 더 정제 (안전장치)
            $excerpt = jenny_clean_content($excerpt);
        } else {
            $excerpt = '';
        }
    }

    // 링크 정보
    $permalink = get_permalink($post_data['post_id']);
    $original_url = get_post_meta($post_data['post_id'], 'news_original_url', true);

    // Source meta
    $news_source = get_post_meta($post_data['post_id'], 'news_source', true);
    if (empty($news_source)) {
        $categories = get_the_category($post_data['post_id']);
        $news_source = !empty($categories) ? $categories[0]->name : '출처 미상';
    }

    $date_str = get_the_date('Y.m.d', $post_data['post_id']);

    // Metadata Line: Source | Date | Original Link
    $meta_line = '<div class="jenny-meta-line">';
    $meta_line .= '<span class="jenny-source">' . esc_html($news_source) . '</span>';
    $meta_line .= '<span class="jenny-separator">|</span>';
    $meta_line .= '<span class="jenny-date">' . $date_str . '</span>';
    if (!empty($original_url)) {
        $meta_line .= '<span class="jenny-separator">|</span>';
        $meta_line .= '<a href="' . esc_url($original_url) . '" target="_blank" rel="noopener noreferrer" class="jenny-original-link">원문 보기</a>';
    }
    $meta_line .= '</div>';

    $html = '<div class="jenny-news-card">';
    $html .= '<div class="jenny-card-image">';
    $html .= '<a href="' . esc_url($permalink) . '">';
    $html .= '<img src="' . esc_url($thumb_url) . '" alt="' . esc_attr(get_the_title($post_data['post_id'])) . '" loading="lazy">';
    $html .= '</a>';
    $html .= '<span class="jenny-badge">' . esc_html($cat_name) . '</span>';
    $html .= '</div>';

    $html .= '<div class="jenny-content">';
    $html .= '<h3 class="jenny-title"><a href="' . esc_url($permalink) . '">' . get_the_title($post_data['post_id']) . '</a></h3>';
    $html .= $meta_line;
    if (!empty($excerpt)) {
        $html .= '<div class="jenny-excerpt">' . esc_html($excerpt) . '</div>';
    }
    $html .= '<a href="' . esc_url($permalink) . '" class="jenny-link"><span class="jenny-link-text">자세히 보기</span></a>';
    $html .= '</div>';
    $html .= '</div>';

    return $html;
}

function jenny_get_weather_html()
{
    // ⚡ NEW: functions.php 캐시 먼저 확인
    if (function_exists('get_cached_weather_data')) {
        $weather_data = get_cached_weather_data();

        if (!empty($weather_data) && is_array($weather_data)) {
            // 캐시 데이터를 원본 shortcode와 동일한 형식으로 출력
            $output = '';
            foreach ($weather_data as $city => $temp) {
                // 원본 shortcode가 반환하는 형식과 동일하게
                $output .= '<div class="jenny-city-weather">';
                $output .= '<div class="jenny-weather-chip">';
                $output .= '<span class="jenny-chip-city">' . esc_html($city) . '</span>';
                $output .= '<span class="jenny-chip-temp">' . esc_html($temp) . '</span>';
                $output .= '</div>';
                $output .= '</div>';
            }
            return $output;
        }
    }

    $cities = array(
        array('name' => '하노이', 'id' => 'hanoi'),
        array('name' => '호치민', 'id' => 'hochiminh'),
        array('name' => '서울', 'id' => 'seoul'),
    );

    $output = '';
    foreach ($cities as $city) {
        $shortcode = '[starter_starter_starter id="' . $city['id'] . '"]';
        $weather_output = do_shortcode($shortcode);
        if (!empty($weather_output) && $weather_output !== $shortcode) {
            $output .= '<div class="jenny-city-weather">' . $weather_output . '</div>';
        }
    }

    if (empty($output)) {
        $output = jenny_get_weather_fallback();
    }

    return $output;
}

function jenny_get_weather_fallback()
{
    $cache_key = 'jenny_weather_html_v4';
    $cached = get_transient($cache_key);
    if ($cached !== false && is_string($cached) && strpos($cached, '°C') !== false) {
        return $cached;
    }

    $cities = array(
        array('name' => '하노이', 'lat' => 21.0285, 'lon' => 105.8542),
        array('name' => '호치민', 'lat' => 10.8231, 'lon' => 106.6297),
        array('name' => '서울', 'lat' => 37.5665, 'lon' => 126.9780),
    );

    $output = '';
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

        $output .= '<div class="jenny-weather-chip">';
        $output .= '<span class="jenny-chip-city">' . esc_html($city['name']) . '</span>';
        $output .= '<span class="jenny-chip-temp">' . esc_html($temp) . '</span>';
        $output .= '</div>';
    }

    if (strpos($output, '°C') !== false) {
        set_transient($cache_key, $output, 30 * MINUTE_IN_SECONDS);
    }
    return $output;
}

function jenny_get_exchange_data()
{
    // ⚡ NEW: functions.php 캐시 먼저 확인
    if (function_exists('get_cached_exchange_rates')) {
        $cached_rates = get_cached_exchange_rates();

        if (!empty($cached_rates) && is_array($cached_rates) && isset($cached_rates['usd'])) {
            return $cached_rates;
        }
    }


    $cache_key = 'jenny_exchange_v3';
    $cached = get_transient($cache_key);
    if ($cached !== false && is_array($cached) && isset($cached['krw_100'])) {
        return $cached;
    }

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

    set_transient($cache_key, $exchange_data, 60 * MINUTE_IN_SECONDS);
    return $exchange_data;
}

/**
 * 특정 날짜의 포스트를 가져와서 top_news와 regular_posts로 분류
 */
function jenny_get_posts_by_date($date, $category_id, $category_order)
{
    $date_parts = explode('-', $date);

    $args = array(
        'post_type' => 'post',
        'posts_per_page' => -1,
        'cat' => intval($category_id),
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
        'date_query' => array(
            array(
                'year' => intval($date_parts[0]),
                'month' => intval($date_parts[1]),
                'day' => intval($date_parts[2]),
            ),
        ),
        'suppress_filters' => false, // 필터 활성화 (중복 방지)
        'no_found_rows' => true, // 성능 최적화
    );

    $query = new WP_Query($args);
    $top_news_posts = array();
    $top_news_ids = array();
    $regular_posts = array();
    $processed_post_ids = array(); // 중복 방지용 (안전장치)

    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $post_id = get_the_ID();

            // 중복 체크: 이미 처리된 포스트는 건너뛰기 (안전장치)
            if (in_array($post_id, $processed_post_ids)) {
                continue;
            }
            $processed_post_ids[] = $post_id;

            $news_category = jenny_get_post_category($post_id);
            $order = isset($category_order[$news_category]) ? $category_order[$news_category] : 99;

            $is_top_raw = get_post_meta($post_id, 'is_top_news', true);
            $is_top = ($is_top_raw === '1' || $is_top_raw === 1 || $is_top_raw === true);

            $item = array(
                'post_id' => $post_id,
                'order' => $order,
                'date' => get_the_date('Y-m-d H:i:s'),
                'category' => $news_category,
                'is_top' => $is_top
            );

            if ($is_top) {
                // 탑뉴스도 중복 체크
                if (!in_array($post_id, $top_news_ids)) {
                    $top_news_posts[] = $item;
                    $top_news_ids[] = $post_id;
                }
            } else {
                // 일반 뉴스도 중복 체크 (같은 post_id가 이미 regular_posts에 있는지 확인)
                $already_in_regular = false;
                foreach ($regular_posts as $existing) {
                    if ($existing['post_id'] === $post_id) {
                        $already_in_regular = true;
                        break;
                    }
                }
                if (!$already_in_regular) {
                    $regular_posts[] = $item;
                }
            }
        }
        wp_reset_postdata();
    }

    return array(
        'top_news' => $top_news_posts,
        'top_news_ids' => $top_news_ids,
        'regular' => $regular_posts
    );
}

/**
 * 오늘 날짜 또는 최근 발행일 가져오기
 */
function jenny_get_target_date($now, $category_id)
{
    $today_vn = $now->format('Y-m-d');

    // 오늘 날짜의 뉴스 확인
    $today_args = array(
        'post_type' => 'post',
        'posts_per_page' => 1,
        'cat' => intval($category_id),
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
        'date_query' => array(
            array(
                'year' => intval($now->format('Y')),
                'month' => intval($now->format('m')),
                'day' => intval($now->format('d')),
            ),
        ),
    );

    $today_query = new WP_Query($today_args);
    if ($today_query->have_posts()) {
        wp_reset_postdata();
        return $today_vn;
    }
    wp_reset_postdata();

    // 오늘 뉴스가 없으면 가장 최근 발행일 가져오기
    $latest_args = array(
        'post_type' => 'post',
        'posts_per_page' => 1,
        'cat' => intval($category_id),
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
    );
    $latest_query = new WP_Query($latest_args);
    if ($latest_query->have_posts()) {
        $latest_query->the_post();
        $target_date = get_the_date('Y-m-d');
        wp_reset_postdata();
        return $target_date;
    }
    wp_reset_postdata();

    return $today_vn;
}

function jenny_daily_news_shortcode($atts)
{
    $atts = shortcode_atts(array(
        'count' => -1,
        'category' => 31,
    ), $atts);

    // 날짜 필터: 오직 "지난 뉴스 보기"에서만 사용
    $selected_date = '';
    if (isset($_GET['news_date'])) {
        $selected_date = sanitize_text_field($_GET['news_date']);
    }
    $is_filtered = ($selected_date !== '');

    // 베트남 시간대 (UI 표시용)
    $tz = new DateTimeZone('Asia/Ho_Chi_Minh');
    $now = new DateTime('now', $tz);

    // 설정값 가져오기
    $category_order = jenny_get_category_order();
    $sections_keys = jenny_get_sections_keys();
    $category_map = jenny_get_category_map();
    $sections = jenny_get_sections();

    // 포스트 가져오기
    if ($is_filtered) {
        // 케이스 1: "지난 뉴스 보기" (날짜 필터 있음)
        $result = jenny_get_posts_by_date($selected_date, $atts['category'], $category_order);
    } else {
        // 케이스 2: 기본 보기 (오늘 뉴스만, 갯수 제한 없음)
        $target_date = jenny_get_target_date($now, $atts['category']);
        $result = jenny_get_posts_by_date($target_date, $atts['category'], $category_order);
    }

    $top_news_posts = $result['top_news'];
    $top_news_ids = $result['top_news_ids'];
    $regular_posts = $result['regular'];

    // 정렬 함수
    $sort_func = function ($a, $b) {
        if ($a['order'] === $b['order']) {
            return strcmp($b['date'], $a['date']);
        }
        return $a['order'] - $b['order'];
    };

    usort($top_news_posts, $sort_func);
    usort($regular_posts, $sort_func);

    // 지난 뉴스 날짜 목록은 AJAX로 로드 (첫 로딩 속도 최적화)
    $page_url = get_permalink();

    $exchange = jenny_get_exchange_data();

    // 상단 전면 광고 (레이아웃 wrapper 바깥에 배치)
    $output = '<div id="jenny-ad-top" class="jenny-ad-section jenny-ad-top-banner">';
    $output .= '<div class="jenny-ad-placeholder jenny-ad-large">';
    $output .= '<!-- Ad Inserter: #jenny-ad-top -->';
    $output .= '</div></div>';

    // 레이아웃 wrapper 시작 (메인 + 사이드바)
    $output .= '<div class="jenny-layout-wrapper">';

    // 메인 콘텐츠 영역 시작
    $output .= '<div class="jenny-main-content">';

    $output .= '<div class="jenny-date-filter">';

    // ... (Filter Header Code remains mostly same, condensed for brevity) ...
    $output .= '<div class="jenny-info-bar">';
    $output .= '<div class="jenny-info-card jenny-weather-card"><div class="jenny-card-header"><span class="jenny-card-icon">🌤</span><span class="jenny-card-title">오늘의 날씨</span><span class="jenny-card-source">(Open-Meteo)</span></div><div class="jenny-card-chips">' . jenny_get_weather_fallback() . '</div></div>';

    $output .= '<div class="jenny-info-card jenny-fx-card"><div class="jenny-card-header"><span class="jenny-card-icon">💱</span><span class="jenny-card-title">환율</span><span class="jenny-card-source">(ECB 기준)</span></div><div class="jenny-card-chips">';
    $output .= '<div class="jenny-fx-chip"><span class="jenny-fx-flag">🇺🇸</span><span class="jenny-fx-label">1 USD</span><span class="jenny-fx-value">' . esc_html($exchange['usd']) . '₫</span></div>';
    $output .= '<div class="jenny-fx-chip"><span class="jenny-fx-flag">🇰🇷</span><span class="jenny-fx-label">100 KRW</span><span class="jenny-fx-value">' . esc_html($exchange['krw_100']) . '₫</span></div>';
    $output .= '</div></div>';

    $output .= '<div class="jenny-filter-buttons">';
    $output .= $is_filtered ? '<a href="' . esc_url($page_url) . '" class="jenny-filter-btn">오늘의 뉴스</a>' : '<span class="jenny-filter-btn active">오늘의 뉴스</span>';

    // 인라인 확장 방식으로 변경 - AJAX로 날짜 목록 로드 (첫 로딩 속도 최적화)
    $output .= '<div class="jenny-archive-wrapper" data-category="' . esc_attr($atts['category']) . '" data-page-url="' . esc_url($page_url) . '" data-selected="' . esc_attr($selected_date) . '">';
    $output .= '<button type="button" class="jenny-filter-btn jenny-archive-btn' . ($is_filtered ? ' active' : '') . '" aria-expanded="false">';
    $output .= '지난 뉴스 보기 <span class="jenny-arrow">▼</span>';
    $output .= '</button>';
    $output .= '<div class="jenny-date-list">'; // AJAX로 채워짐
    $output .= '<div class="jenny-date-loading">날짜 목록 불러오는 중...</div>';
    $output .= '</div></div></div>'; // Close filter-buttons

    // 섹션 네비게이션 메뉴 추가
    $output .= '<div class="jenny-section-nav">';
    $output .= '<div class="jenny-section-nav-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">';
    $output .= '<div style="display: flex; align-items: center;">';
    $output .= '<span class="jenny-section-nav-icon">📍</span>';
    $output .= '<span class="jenny-section-nav-title" style="margin: 0;">뉴스 항목별 기사 보기</span>';
    $output .= '</div>';

    // Add Search Box
    $output .= '<div class="jenny-search-box">';
    $output .= '<form role="search" method="get" class="jenny-search-form" action="' . esc_url(home_url('/')) . '">';
    $output .= '<input type="search" class="jenny-search-field" placeholder="뉴스 검색..." value="' . get_search_query() . '" name="s" title="Search for:" />';
    $output .= '<button type="submit" class="jenny-search-submit"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></button>';
    $output .= '</form>';
    $output .= '</div>';

    $output .= '</div>';
    $output .= '<div class="jenny-section-nav-list">';

    // 섹션 네비게이션 항목 (탑뉴스 제외)
    $section_nav_items = jenny_get_section_nav_items();

    foreach ($section_nav_items as $sec_key => $nav_info) {
        $output .= '<button type="button" class="jenny-section-nav-item" data-section="' . esc_attr($sec_key) . '">';
        $output .= '<span class="jenny-nav-icon">' . esc_html($nav_info['icon']) . '</span>';
        $output .= '<span class="jenny-nav-label">' . esc_html($nav_info['label']) . '</span>';
        $output .= '</button>';
    }

    $output .= '</div>'; // Close jenny-section-nav-list
    $output .= '</div>'; // Close jenny-section-nav
    $output .= '</div>'; // Close jenny-info-bar
    $output .= '</div>'; // Close jenny-date-filter

    if ($is_filtered) {
        $sel_date_obj = new DateTime($selected_date);
        $display_date = $sel_date_obj->format('Y') . '년 ' . $sel_date_obj->format('m') . '월 ' . $sel_date_obj->format('d') . '일';
        $output .= '<div class="jenny-filter-info">' . esc_html($display_date) . ' 뉴스를 보고 있습니다. <a href="' . esc_url($page_url) . '">최신 뉴스로 돌아가기</a></div>';
    }

    if (empty($top_news_posts) && empty($regular_posts)) {
        $output .= '<p style="text-align:center; padding: 40px 20px; color: #6b7280;">선택한 날짜에 등록된 뉴스가 없습니다.</p>';
        $output .= jenny_get_styles();
        return $output;
    }


    // regular_posts를 섹션별로 그룹화 (중복 방지)
    $grouped_posts = array();
    $grouped_post_ids = array(); // 그룹화된 포스트 ID 추적

    foreach ($regular_posts as $post) {
        $post_id = $post['post_id'];

        // 이미 다른 섹션에 추가된 포스트는 건너뛰기
        if (in_array($post_id, $grouped_post_ids)) {
            continue;
        }

        $cat = trim($post['category']);
        $sec_key = jenny_get_section_key($cat, $sections_keys);

        if (!isset($grouped_posts[$sec_key])) {
            $grouped_posts[$sec_key] = array();
        }
        $grouped_posts[$sec_key][] = $post;
        $grouped_post_ids[] = $post_id; // 추가된 포스트 ID 기록
    }

    // sort function reused
    $sort_func = function ($a, $b) {
        return strcmp($b['date'], $a['date']); // Sort by date DESC within section
    };

    // --- 1. Top News Section (First 2 Top News) ---
    if (!empty($top_news_posts)) {
        $output .= '<h2 class="jenny-section-title">🔥 주요 뉴스</h2>';
        // 탑뉴스는 반드시 2열 그리드로 표시 (jenny-top-news-row 클래스 사용)
        $output .= '<div class="jenny-top-news-row jenny-top-news-container">';
        $top_count = 0;
        foreach ($top_news_posts as $post) {
            if ($top_count >= 2) {
                // If extra top news, add to regular posts in the correct section (중복 체크)
                $post_id = $post['post_id'];
                if (!in_array($post_id, $grouped_post_ids)) {
                    $sec_key = jenny_get_section_key($post['category'], $sections_keys);
                    if (!isset($grouped_posts[$sec_key])) {
                        $grouped_posts[$sec_key] = array();
                    }
                    $grouped_posts[$sec_key][] = $post;
                    $grouped_post_ids[] = $post_id;
                }
                continue;
            }
            $output .= jenny_render_news_card($post, $category_map);
            $top_count++;
        }
        $output .= '</div>'; // Close jenny-top-news-row

        // Ad Slot after Top News
        $output .= '<div id="jenny-ad-after-topnews" class="jenny-ad-section"><div class="jenny-ad-placeholder">';
        $output .= '<!-- Ad Inserter: #jenny-ad-after-topnews -->';
        $output .= '</div></div>';
    }

    // --- 2. Render Sections ---
    foreach ($sections as $sec_key => $sec_info) {
        if (!empty($grouped_posts[$sec_key])) {
            // Sort
            usort($grouped_posts[$sec_key], $sort_func);

            $output .= '<h2 id="jenny-section-' . esc_attr($sec_key) . '" class="jenny-section-title">' . esc_html($sec_info['title']) . '</h2>';
            $output .= '<div class="jenny-news-grid">'; // 4-column grid

            $card_count = 0;
            $ad_index = 1; // 섹션 내 광고 번호
            foreach ($grouped_posts[$sec_key] as $post) {
                // 4개마다 광고 삽입 (첫 4개 이후부터)
                if ($card_count > 0 && $card_count % 4 === 0) {
                    $ad_id = 'jenny-ad-' . esc_attr($sec_key) . '-' . $ad_index;
                    $output .= '</div>'; // 기존 그리드 닫기
                    $output .= '<div id="' . $ad_id . '" class="jenny-ad-section jenny-ad-inline">';
                    $output .= '<div class="jenny-ad-placeholder">';
                    $output .= '<!-- Ad Inserter: #' . $ad_id . ' -->';
                    $output .= '</div></div>';
                    $output .= '<div class="jenny-news-grid">'; // 새 그리드 시작
                    $ad_index++;
                }
                $output .= jenny_render_news_card($post, $category_map);
                $card_count++;
            }

            $output .= '</div>';

            // AD SLOT after each section
            $ad_end_id = 'jenny-ad-' . esc_attr($sec_key) . '-end';
            $output .= '<div id="' . $ad_end_id . '" class="jenny-ad-section"><div class="jenny-ad-placeholder">';
            $output .= '<!-- Ad Inserter: #' . $ad_end_id . ' -->';
            $output .= '</div></div>';
        }
    }

    wp_reset_postdata();

    // 메인 콘텐츠 영역 닫기
    $output .= '</div>'; // Close jenny-main-content

    // 사이드바 광고 (PC에서만 표시, sticky)
    $output .= '<div class="jenny-sidebar-ad">';
    $output .= '<div class="jenny-sidebar-ad-inner">';
    $output .= '<div id="jenny-ad-sidebar-1" class="jenny-ad-placeholder jenny-ad-sidebar">';
    $output .= '<!-- Ad Inserter: #jenny-ad-sidebar-1 -->';
    $output .= '</div>';
    $output .= '<div id="jenny-ad-sidebar-2" class="jenny-ad-placeholder jenny-ad-sidebar" style="margin-top: 20px;">';
    $output .= '<!-- Ad Inserter: #jenny-ad-sidebar-2 -->';
    $output .= '</div>';
    $output .= '</div></div>';

    // 레이아웃 wrapper 닫기
    $output .= '</div>'; // Close jenny-layout-wrapper

    // 섹션 뉴스 모달
    $output .= '<div id="jennySectionModal" class="jenny-section-modal">';
    $output .= '<div class="jenny-section-modal-content">';
    $output .= '<div class="jenny-section-modal-header">';
    $output .= '<h3 id="jennySectionModalTitle" class="jenny-section-modal-title">섹션 뉴스</h3>';
    $output .= '<button id="jennySectionModalClose" class="jenny-section-modal-close">&times;</button>';
    $output .= '</div>';
    $output .= '<div id="jennySectionNewsContainer" class="jenny-section-news-container"></div>';
    $output .= '<button id="jennySectionLoadMore" class="jenny-section-load-more" style="display:none;">더 보기</button>';
    $output .= '</div>';
    $output .= '</div>';

    $output .= jenny_get_styles();
    $output .= jenny_get_scripts($atts['category']);

    return $output;
}
add_shortcode('daily_news_list', 'jenny_daily_news_shortcode');

function jenny_register_meta_fields()
{
    if (function_exists('register_post_meta')) {
        $meta_args = array(
            'show_in_rest' => true,
            'single' => true,
            'type' => 'string',
            'auth_callback' => function () {
                return current_user_can('edit_posts');
            }
        );
        register_post_meta('post', 'news_category', $meta_args);
        register_post_meta('post', 'is_top_news', $meta_args);
        register_post_meta('post', 'news_source', $meta_args);
        register_post_meta('post', 'news_original_url', $meta_args);
    }
}
add_action('init', 'jenny_register_meta_fields');

/**
 * WordPress 본문 페이지에 모바일 스타일 추가 (전역 적용)
 * shortcode 밖의 WordPress 본문 페이지에도 적용되도록 wp_head에 추가
 */
function jenny_add_global_mobile_styles()
{
    // 단일 포스트 페이지에서만 적용
    if (is_single() || is_page()) {
        echo '<style>
        /* WordPress 본문 페이지 모바일 표시 보장 - 전역 적용 */
        @media (max-width: 768px) {
            /* 본문 콘텐츠가 모바일에서 보이도록 보장 - 모든 가능한 WordPress 본문 클래스 포함 */
            .entry-content,
            .post-content,
            .content-area .entry-content,
            article .entry-content,
            .single-post .entry-content,
            .post .entry-content,
            .single .entry-content,
            .page .entry-content,
            .type-post .entry-content,
            .news-body-content,
            .post-content-area,
            .article-content,
            main .entry-content,
            .site-main .entry-content,
            #content .entry-content,
            .content .entry-content {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                width: 100% !important;
                max-width: 100% !important;
                overflow: visible !important;
                position: relative !important;
                z-index: 1 !important;
                background-color: transparent !important;
                font-size: 16px !important;
                line-height: 1.6 !important;
            }
            /* 본문 내부 텍스트 요소가 모바일에서 보이도록 (이미지 제외) */
            .entry-content p,
            .entry-content div:not(.wp-block-image):not(.wp-block-gallery),
            .post-content p,
            .post-content div:not(.wp-block-image):not(.wp-block-gallery),
            .news-body-content p,
            .news-body-content div:not(.wp-block-image):not(.wp-block-gallery) {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            /* 본문 텍스트가 모바일에서 보이도록 - 모든 텍스트 요소 포함 */
            .entry-content p,
            .post-content p,
            .entry-content div,
            .post-content div,
            .entry-content span,
            .post-content span,
            .entry-content li,
            .post-content li,
            .entry-content td,
            .post-content td,
            .news-body-content p,
            .news-body-content div,
            .news-body-content span {
                display: block !important;
                visibility: visible !important;
                color: #111827 !important;
                opacity: 1 !important;
            }
            /* 인라인 요소도 보이도록 */
            .entry-content strong,
            .entry-content em,
            .entry-content a,
            .post-content strong,
            .post-content em,
            .post-content a,
            .news-body-content strong,
            .news-body-content em,
            .news-body-content a {
                display: inline !important;
                visibility: visible !important;
                color: #111827 !important;
                opacity: 1 !important;
            }
            /* 링크는 파란색으로 */
            .entry-content a,
            .post-content a,
            .news-body-content a {
                color: #2563eb !important;
                text-decoration: underline !important;
            }
            /* 리스트도 보이도록 */
            .entry-content ul,
            .entry-content ol,
            .post-content ul,
            .post-content ol,
            .news-body-content ul,
            .news-body-content ol {
                display: block !important;
                visibility: visible !important;
                margin: 16px 0 !important;
                padding-left: 24px !important;
            }
            .entry-content li,
            .post-content li,
            .news-body-content li {
                display: list-item !important;
                visibility: visible !important;
                color: #111827 !important;
            }
        }
        </style>';
    }
}
add_action('wp_head', 'jenny_add_global_mobile_styles');

function jenny_get_scripts($category_id = 31)
{
    return '<script>
    (function() {
        // 아코디언 토글 기능 (모바일 + PC 모두) + AJAX 날짜 로드
        document.addEventListener("DOMContentLoaded", function() {
            var archiveWrappers = document.querySelectorAll(".jenny-archive-wrapper");
            archiveWrappers.forEach(function(wrapper) {
                var btn = wrapper.querySelector(".jenny-archive-btn");
                var dateList = wrapper.querySelector(".jenny-date-list");
                var datesLoaded = false; // 날짜 목록 로드 여부
                
                if (!btn || !dateList) return;
                
                // AJAX로 날짜 목록 로드 함수
                function loadArchiveDates() {
                    if (datesLoaded) return; // 이미 로드됨
                    
                    var category = wrapper.getAttribute("data-category") || "31";
                    var pageUrl = wrapper.getAttribute("data-page-url") || window.location.href;
                    var selected = wrapper.getAttribute("data-selected") || "";
                    
                    // AJAX 요청
                    var xhr = new XMLHttpRequest();
                    xhr.open("POST", (typeof jennyAjax !== "undefined" ? jennyAjax.ajaxurl : "/wp-admin/admin-ajax.php"), true);
                    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                    xhr.onreadystatechange = function() {
                        if (xhr.readyState === 4) {
                            if (xhr.status === 200) {
                                try {
                                    var response = JSON.parse(xhr.responseText);
                                    if (response.success && response.data.html) {
                                        dateList.innerHTML = response.data.html;
                                        datesLoaded = true;
                                        // 새로 로드된 날짜 옵션에 이벤트 리스너 추가
                                        bindDateOptionEvents();
                                    }
                                } catch(e) {
                                    dateList.innerHTML = "<div class=\"jenny-date-option jenny-no-dates\">날짜 목록을 불러올 수 없습니다.</div>";
                                }
                            } else {
                                dateList.innerHTML = "<div class=\"jenny-date-option jenny-no-dates\">날짜 목록을 불러올 수 없습니다.</div>";
                            }
                        }
                    };
                    xhr.send("action=jenny_get_archive_dates&category=" + encodeURIComponent(category) + "&page_url=" + encodeURIComponent(pageUrl) + "&selected=" + encodeURIComponent(selected));
                }
                
                // 날짜 옵션 이벤트 바인딩 함수
                function bindDateOptionEvents() {
                    var dateOptions = dateList.querySelectorAll(".jenny-date-option");
                    dateOptions.forEach(function(option) {
                        option.addEventListener("click", function() {
                            wrapper.classList.remove("active");
                            btn.setAttribute("aria-expanded", "false");
                        });
                    });
                }
                
                // 클릭 이벤트 처리 (모바일 + PC)
                btn.addEventListener("click", function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // 다른 아코디언 닫기
                    archiveWrappers.forEach(function(otherWrapper) {
                        if (otherWrapper !== wrapper) {
                            otherWrapper.classList.remove("active");
                            var otherBtn = otherWrapper.querySelector(".jenny-archive-btn");
                            if (otherBtn) {
                                otherBtn.setAttribute("aria-expanded", "false");
                            }
                        }
                    });
                    
                    // 현재 아코디언 토글
                    var isActive = wrapper.classList.contains("active");
                    wrapper.classList.toggle("active");
                    btn.setAttribute("aria-expanded", !isActive ? "true" : "false");
                    
                    // 열릴 때 AJAX로 날짜 목록 로드
                    if (!isActive && !datesLoaded) {
                        loadArchiveDates();
                    }
                });
                
                // 아코디언 외부 클릭 시 닫기
                document.addEventListener("click", function(e) {
                    if (!wrapper.contains(e.target)) {
                        wrapper.classList.remove("active");
                        btn.setAttribute("aria-expanded", "false");
                    }
                });
            });
            
            // 섹션 네비게이션 클릭 - AJAX로 섹션 뉴스 로드
            var sectionNavItems = document.querySelectorAll(".jenny-section-nav-item");
            var sectionModal = document.getElementById("jennySectionModal");
            var sectionModalClose = document.getElementById("jennySectionModalClose");
            var sectionModalTitle = document.getElementById("jennySectionModalTitle");
            var sectionNewsContainer = document.getElementById("jennySectionNewsContainer");
            var sectionLoadMore = document.getElementById("jennySectionLoadMore");
            var currentSectionKey = "";
            var currentPage = 1;
            var categoryId = ' . intval($category_id) . ';
            
            // 모달 요소가 존재하는지 확인
            if (!sectionModal || !sectionNewsContainer) {
                console.error("Jenny: 섹션 모달 요소를 찾을 수 없습니다.");
                return;
            }
            
            sectionNavItems.forEach(function(item) {
                item.addEventListener("click", function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var sectionKey = this.getAttribute("data-section");
                    
                    console.log("Jenny: 섹션 클릭됨 - " + sectionKey);
                    
                    // 활성 상태 표시
                    sectionNavItems.forEach(function(nav) {
                        nav.classList.remove("active");
                    });
                    this.classList.add("active");
                    
                    // 모달 열기 및 뉴스 로드
                    currentSectionKey = sectionKey;
                    currentPage = 1;
                    sectionNewsContainer.innerHTML = "<div class=\"jenny-section-loading\">뉴스를 불러오는 중...</div>";
                    sectionModal.classList.add("show");
                    document.body.style.overflow = "hidden";
                    
                    loadSectionNews(sectionKey, 1, true);
                });
            });
            
            // 모달 닫기
            if (sectionModalClose) {
                sectionModalClose.addEventListener("click", function() {
                    sectionModal.classList.remove("show");
                    document.body.style.overflow = "";
                    sectionNavItems.forEach(function(nav) {
                        nav.classList.remove("active");
                    });
                });
            }
            
            // 모달 외부 클릭시 닫기
            if (sectionModal) {
                sectionModal.addEventListener("click", function(e) {
                    if (e.target === sectionModal) {
                        sectionModal.classList.remove("show");
                        document.body.style.overflow = "";
                        sectionNavItems.forEach(function(nav) {
                            nav.classList.remove("active");
                        });
                    }
                });
            }
            
            // 더 보기 버튼
            if (sectionLoadMore) {
                sectionLoadMore.addEventListener("click", function() {
                    currentPage++;
                    loadSectionNews(currentSectionKey, currentPage, false);
                });
            }
            
            // 섹션 뉴스 로드 함수
            function loadSectionNews(sectionKey, page, isNew) {
                var xhr = new XMLHttpRequest();
                xhr.open("POST", jennyAjax.ajaxurl, true);
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 400) {
                        try {
                            var resp = JSON.parse(xhr.responseText);
                            if (resp.success) {
                                if (isNew) {
                                    sectionNewsContainer.innerHTML = resp.data.html;
                                    sectionModalTitle.textContent = resp.data.section_title;
                                } else {
                                    sectionNewsContainer.insertAdjacentHTML("beforeend", resp.data.html);
                                }
                                
                                // 더 보기 버튼 표시/숨김
                                if (resp.data.has_more) {
                                    sectionLoadMore.style.display = "block";
                                } else {
                                    sectionLoadMore.style.display = "none";
                                }
                            } else {
                                sectionNewsContainer.innerHTML = "<div class=\"jenny-section-error\">뉴스를 불러오지 못했습니다.</div>";
                            }
                        } catch (e) {
                            sectionNewsContainer.innerHTML = "<div class=\"jenny-section-error\">응답 처리 중 오류가 발생했습니다.</div>";
                        }
                    } else {
                        sectionNewsContainer.innerHTML = "<div class=\"jenny-section-error\">서버 오류가 발생했습니다.</div>";
                    }
                };
                
                xhr.onerror = function() {
                    sectionNewsContainer.innerHTML = "<div class=\"jenny-section-error\">네트워크 오류가 발생했습니다.</div>";
                };
                
                xhr.send("action=jenny_get_section_news&section=" + encodeURIComponent(sectionKey) + "&page=" + page + "&category_id=" + categoryId);
            }
        });
    })();
    </script>';
}

function jenny_get_styles()
{
    return '<style>
        /* Container - 전체 범주를 벗어나지 않도록 */
        .jenny-date-filter,
        .jenny-top-news-row,
        .jenny-top-news-container,
        .jenny-news-grid {
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: 100% !important;
            overflow: hidden !important;
        }
        
        /* Existing Styles ... */
        .jenny-date-filter { 
            margin-bottom: 24px; 
            padding: 20px; 
            border-bottom: 1px solid #e5e7eb;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%);
            border-radius: 16px;
            box-shadow: 0 4px 12px rgba(234, 88, 12, 0.1);
        }
        .jenny-info-bar { 
            display: flex; 
            gap: 16px; 
            align-items: center; 
            flex-wrap: wrap; 
        }
        .jenny-info-card { 
            background: linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%); 
            border: 2px solid #0ea5e9; 
            border-radius: 12px; 
            padding: 12px 16px; 
            box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15);
        }
        .jenny-card-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
        .jenny-card-icon { font-size: 16px; }
        .jenny-card-title { font-size: 11px; font-weight: 700; color: #0ea5e9; text-transform: uppercase; letter-spacing: 0.5px; }
        .jenny-card-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .jenny-weather-chip, .jenny-fx-chip { display: flex; align-items: center; gap: 4px; background: #ffffff; padding: 6px 10px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; }
        .jenny-chip-city { font-size: 12px; font-weight: 600; color: #374151; }
        .jenny-chip-temp, .jenny-fx-value { font-size: 13px; font-weight: 700; color: #ea580c; }
        .jenny-fx-flag { font-size: 14px; }
        .jenny-fx-label { font-size: 11px; color: #6b7280; font-weight: 500; }
        .jenny-fx-value { color: #059669; }
        .jenny-card-source { font-size: 9px; color: #9ca3af; font-weight: 400; margin-left: 4px; }
        .jenny-filter-buttons { 
            display: flex; 
            gap: 12px; 
            align-items: flex-end; /* 아코디언이 위로 펼쳐지므로 하단 정렬 */
            margin-left: auto; 
            flex-wrap: wrap;
        }
        @media (max-width: 900px) { 
            .jenny-info-bar { 
                flex-direction: column; 
                align-items: flex-start; 
            } 
            .jenny-filter-buttons { 
                margin-left: 0; 
                margin-top: 12px; 
                width: 100%;
            }
            .jenny-archive-wrapper {
                width: 100%;
            }
        }
        .jenny-filter-btn { display: inline-block; padding: 10px 20px; background: #f3f4f6; color: #374151; text-decoration: none; border: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; cursor: pointer; }
        .jenny-filter-btn:hover { background: #e5e7eb; color: #111827; }
        .jenny-filter-btn.active { background: #ea580c; color: #ffffff; border-color: #ea580c; }
        
        /* 섹션 네비게이션 스타일 */
        .jenny-section-nav {
            width: 100%;
            margin-top: 16px;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fef3c7 100%);
            border: 2px solid #f59e0b;
            border-radius: 12px;
            padding: 12px;
            box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
        }
        .jenny-section-nav-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e5e7eb;
        }
        .jenny-section-nav-icon {
            font-size: 18px;
        }
        .jenny-section-nav-title {
            font-size: 13px;
            font-weight: 700;
            color: #92400e;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .jenny-section-nav-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .jenny-section-nav-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 20px;
            text-decoration: none;
            font-size: 13px;
            font-weight: 600;
            color: #374151;
            transition: all 0.2s ease;
            white-space: nowrap;
            cursor: pointer;
            font-family: inherit;
            outline: none;
        }
        .jenny-section-nav-item:hover {
            background: #f3f4f6;
            border-color: #ea580c;
            color: #ea580c;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(234, 88, 12, 0.1);
        }
        .jenny-section-nav-item.active {
            background: #ea580c;
            border-color: #ea580c;
            color: #ffffff;
        }
        .jenny-nav-icon {
            font-size: 14px;
        }
        .jenny-nav-label {
            font-size: 12px;
        }
        
        /* 모바일에서 섹션 네비게이션 스타일 */
        @media (max-width: 768px) {
            .jenny-section-nav {
                padding: 10px;
            }
            .jenny-section-nav-list {
                gap: 6px;
            }
            .jenny-section-nav-item {
                padding: 6px 10px;
                font-size: 12px;
            }
            .jenny-nav-label {
                font-size: 11px;
            }
            .jenny-nav-icon {
                font-size: 12px;
            }
        }
        
        /* 섹션 제목에 스크롤 마진 추가 */
        .jenny-section-title {
            scroll-margin-top: 100px; /* 네비게이션 클릭 시 상단 여백 */
        }
        
        .jenny-archive-wrapper { 
            position: relative; 
            width: 100%;
        }
        .jenny-archive-btn {
            width: 100%;
            text-align: left;
            position: relative;
        }
        .jenny-arrow {
            display: inline-block;
            transition: transform 0.3s ease;
            margin-left: 8px;
        }
        .jenny-archive-wrapper.active .jenny-arrow {
            transform: rotate(180deg);
        }
        /* 인라인 확장 방식 - 페이지 플로우에 자연스럽게 포함 (가려지지 않음) */
        .jenny-date-list { 
            display: none; 
            width: 100%;
            background: #ffffff; 
            border: 1px solid #e5e7eb; 
            border-top: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1); 
            margin-top: 0;
            border-radius: 0 0 8px 8px;
            /* 스크롤 가능하도록 설정 - 모든 날짜가 보이도록 */
            max-height: 70vh;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
        }
        .jenny-archive-wrapper.active .jenny-date-list { 
            display: block !important; 
        }
        /* PC에서는 클릭으로만 열기 (호버 제거로 흔들림 방지) */
        @media (min-width: 769px) {
            .jenny-date-list {
                max-height: 60vh; /* PC에서는 조금 더 작게 */
            }
        }
        /* 모바일에서는 더 많은 공간 사용 */
        @media (max-width: 768px) {
            .jenny-date-list {
                max-height: 70vh; /* 모바일에서는 더 많은 공간 */
            }
        }
        .jenny-date-option { 
            display: block; 
            padding: 12px 16px; 
            color: #374151; 
            text-decoration: none; 
            font-size: 14px; 
            border-bottom: 1px solid #f3f4f6; 
            min-height: 44px; /* 모바일 터치 영역 확보 */
            display: flex;
            align-items: center;
            transition: background-color 0.2s ease;
        }
        .jenny-date-option:hover { 
            background: #f3f4f6; 
        }
        .jenny-date-option.selected { 
            background: #fef3c7; 
            color: #ea580c; 
            font-weight: 600; 
        }
        .jenny-date-option:last-child { 
            border-bottom: none; 
        }
        .jenny-no-dates {
            color: #9ca3af;
            font-style: italic;
            cursor: default;
        }
        .jenny-no-dates:hover {
            background: transparent;
        }
        .jenny-date-loading {
            padding: 20px 16px;
            color: #6b7280;
            font-size: 14px;
            text-align: center;
        }
        .jenny-date-loading::after {
            content: "";
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid #e5e7eb;
            border-top-color: #ea580c;
            border-radius: 50%;
            animation: jenny-spin 0.8s linear infinite;
            margin-left: 8px;
            vertical-align: middle;
        }
        @keyframes jenny-spin {
            to { transform: rotate(360deg); }
        }
        .jenny-filter-info { margin-top: 12px; padding: 10px 16px; background: #fef3c7; color: #92400e; font-size: 14px; border-left: 3px solid #ea580c; }
        .jenny-filter-info a { color: #ea580c; font-weight: 600; }
        
        /* SEARCH BOX */
        .jenny-search-form {
            display: flex;
            align-items: center;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            overflow: hidden;
            height: 36px;
        }
        .jenny-search-field {
            border: none !important;
            padding: 0 12px;
            height: 100%;
            font-size: 14px;
            color: #374151;
            width: 180px;
            outline: none;
            background: transparent;
            box-shadow: none !important;
        }
        .jenny-search-field:focus {
            box-shadow: none !important;
            border: none !important;
            outline: none !important;
        }
        .jenny-search-field::placeholder {
            color: #9ca3af;
        }
        .jenny-search-submit {
            background: #f9fafb;
            border: none;
            border-left: 1px solid #e5e7eb;
            color: #6b7280;
            padding: 0 12px;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .jenny-search-submit:hover {
            background: #f3f4f6;
            color: #ea580c;
        }
        @media (max-width: 640px) {
            .jenny-section-nav-header {
                flex-direction: column !important;
                align-items: stretch !important;
            }
            .jenny-search-form {
                width: 100%;
                margin-top: 8px;
            }
            .jenny-search-field {
                flex-grow: 1;
                width: 100%;
            }
        }
        
        /* SECTION TITLES - 섹션 제목은 항상 검정색 */
        .jenny-section-title {
            font-size: 20px;
            font-weight: 800;
            color: #111827 !important; /* 검정색으로 확실하게 고정 */
            margin: 32px 0 16px 0;
            padding-left: 12px;
            border-left: 4px solid #ea580c;
        }

        /* GRID LAYOUTS */
        /* 탑뉴스는 반드시 2열 그리드로 표시 - !important로 다른 CSS 오버라이드 방지 */
        .jenny-top-news-row,
        .jenny-top-news-container {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 30px !important;
            margin-bottom: 50px !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
        }
        /* 탑뉴스 섹션 내부의 카드는 그리드 아이템으로 표시 */
        .jenny-top-news-row .jenny-news-card,
        .jenny-top-news-container .jenny-news-card {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
        }
        /* 일반 뉴스는 4열 그리드 - 탑뉴스의 절반 크기 (2열 = 50%, 4열 = 25% = 절반) */
        .jenny-news-grid {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 16px !important; /* 탑뉴스 gap(30px)의 절반보다 작게 */
            padding-bottom: 40px !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            margin: 0 !important;
        }
        /* 일반 뉴스 카드는 탑뉴스의 절반 크기로 제한 */
        .jenny-news-grid .jenny-news-card {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            min-width: 0 !important; /* 그리드 오버플로우 방지 */
        }

        /* RESPONSIVE */
        @media (max-width: 1024px) {
            .jenny-news-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 768px) {
            /* 모바일에서는 모든 뉴스가 하나씩 세로로 표시 */
            .jenny-top-news-row,
            .jenny-top-news-container {
                grid-template-columns: 1fr !important;
                gap: 20px !important; /* 모바일에서 간격 축소 */
                margin-bottom: 30px !important; /* 하단 여백 축소 */
            }
            .jenny-news-grid { 
                grid-template-columns: 1fr !important; /* 모바일에서 1열로 강제 */
                gap: 20px !important; /* 모바일에서 간격 축소 */
                padding-bottom: 30px !important; /* 하단 여백 축소 */
            }
            /* 모바일에서 섹션 제목 크기 조정 */
            .jenny-section-title {
                font-size: 18px !important;
                margin: 24px 0 12px 0 !important;
            }
            /* 모바일에서 제목 크기 조정 */
            .jenny-title {
                font-size: 18px !important;
            }
            .jenny-top-news-row .jenny-title,
            .jenny-top-news-container .jenny-title {
                font-size: 20px !important;
            }
        }

/* FLAT CARD STYLE - WITH BORDER AND SEPARATED SECTIONS */
.jenny-news-card {
    background: #ffffff;
    border: 1px solid #e5e7eb; /* 흰색 테두리 */
    box-shadow: none;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* 테두리 내부로 오버플로우 제한 */
}
.jenny-news-card:hover {
    transform: none;
    box-shadow: none;
    border-color: #d1d5db; /* 호버 시 테두리 색상 약간 진하게 */
}

        /* IMAGE - NO RADIUS */
        .jenny-card-image {
            position: relative;
            padding-top: 56.25%; /* 16:9 */
            overflow: hidden;
            background: #f3f4f6;
            border-radius: 0 !important;
            margin-bottom: 12px;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
        }
        .jenny-card-image img {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;
            transition: transform 0.3s ease;
            max-width: 100% !important;
        }
        .jenny-card-image:hover img {
            transform: scale(1.02); /* Subtle zoom only */
        }
        /* 일반 뉴스 그리드의 이미지는 더 작은 비율 */
        .jenny-news-grid .jenny-card-image {
            padding-top: 60% !important; /* 약간 더 작은 비율 */
            margin-bottom: 10px !important;
        }

        .jenny-badge {
            position: absolute; top: 12px; left: 12px;
            background: #000000;
            color: #ffffff;
            padding: 4px 8px;
            font-size: 10px;
            font-weight: 700;
            border-radius: 0; /* Flat badge */
            text-transform: uppercase;
        }

        /* CONTENT - 아래부분에 옅은 배경색 추가 */
        .jenny-content { 
            padding: 16px; /* 패딩 추가 */
            flex-grow: 1; 
            display: flex; 
            flex-direction: column; 
            text-align: left;
            background: #f9fafb; /* 옅은 회색 배경 */
            border-top: 1px solid #e5e7eb; /* 위부분과 구분선 */
        }

        /* TITLE - 뉴스 제목은 항상 검정색으로 확실하게 고정 */
        .jenny-title {
            font-size: 16px; /* 일반 뉴스 기본 크기 */
            font-weight: 800;
            color: #111827 !important; /* 검정색으로 확실하게 고정 */
            margin: 0 0 6px 0;
            line-height: 1.35;
        }
        .jenny-title a { 
            color: #111827 !important; /* 검정색으로 확실하게 고정 */
            text-decoration: none; 
            display: block; /* 터치 영역 확보 */
            padding: 4px 0; /* 모바일 터치 영역 확보 */
        }
        .jenny-title a:hover,
        .jenny-title:hover,
        .jenny-news-card .jenny-title a:hover,
        .jenny-news-card .jenny-title:hover {
            color: #3b82f6 !important; /* 호버 시 파란색 */
            text-decoration: underline; 
        }

        /* TOP NEWS BIGGER TITLE - 탑뉴스는 더 큰 제목 */
        .jenny-top-news-row .jenny-title,
        .jenny-top-news-container .jenny-title {
            font-size: 22px !important;
        }
        /* 탑뉴스 제목 호버도 파란색 */
        .jenny-top-news-row .jenny-title a:hover,
        .jenny-top-news-container .jenny-title a:hover {
            color: #3b82f6 !important; /* 호버 시 파란색 */
        }
        
        /* 일반 뉴스 그리드의 제목은 더 작게 (탑뉴스의 약 70%) */
        .jenny-news-grid .jenny-title {
            font-size: 16px !important;
        }

        /* METADATA LINE: Source | Date | Original Link */
        .jenny-meta-line {
            display: flex;
            align-items: center;
            font-size: 12px;
            color: #111827 !important; /* 검정색으로 통일 */
            margin-bottom: 10px;
            font-weight: 500;
            flex-wrap: wrap; /* 모바일에서 줄바꿈 허용 */
        }
        /* 모바일에서 메타 라인 링크 터치 영역 확보 */
        @media (max-width: 768px) {
            .jenny-meta-line a {
                padding: 4px 2px; /* 터치 영역 확보 */
                min-height: 32px; /* 최소 터치 영역 */
                display: inline-flex;
                align-items: center;
            }
        }
        .jenny-separator {
            margin: 0 6px;
            color: #9ca3af !important; /* 구분선은 회색 */
            font-size: 10px;
        }
        .jenny-source { color: #111827 !important; font-weight: 700; }
        .jenny-date { color: #111827 !important; }
        .jenny-original-link,
        a.jenny-original-link {
            color: #ea580c !important;
            text-decoration: none !important;
            font-weight: 700;
            transition: color 0.2s ease !important;
        }
        .jenny-original-link:hover,
        a.jenny-original-link:hover,
        .jenny-meta-line .jenny-original-link:hover,
        .jenny-meta-line a.jenny-original-link:hover {
            color: #22c55e !important; /* 호버 시 초록색 - 확실하게! */
            text-decoration: underline !important;
            background-color: transparent !important;
            border-color: transparent !important;
        }

        /* EXCERPT */
        .jenny-excerpt {
            font-size: 14px;
            color: #111827 !important; /* 검정색으로 통일 */
            line-height: 1.6;
            margin-bottom: 12px;
            display: -webkit-box;
            -webkit-line-clamp: 5; /* 5줄로 증가 */
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        /* 일반 뉴스 그리드의 요약도 5줄 */
        .jenny-news-grid .jenny-excerpt {
            font-size: 13px !important;
            -webkit-line-clamp: 5 !important; /* 일반 뉴스도 5줄로 증가 */
        }
        /* 일반 뉴스 그리드의 메타라인도 더 작게 */
        .jenny-news-grid .jenny-meta-line {
            font-size: 11px !important;
        }

        /* READ MORE - Independent Line */
        .jenny-link {
            display: block;
            margin-top: auto;
            text-decoration: none !important;
            min-height: 44px; /* 모바일 터치 영역 확보 (최소 44x44px 권장) */
            display: flex;
            align-items: center;
        }
        .jenny-link-text {
            font-size: 13px;
            font-weight: 700;
            color: #111827;
            border-bottom: 2px solid #ea580c;
            padding-bottom: 2px;
            padding: 8px 0; /* 터치 영역 확보를 위한 패딩 추가 */
        }
        .jenny-link:hover .jenny-link-text {
            background: #ea580c;
            color: #ffffff;
        }

        /* ============================================
           광고 레이아웃 스타일
           ============================================ */
        
        /* 전체 레이아웃 wrapper (메인 + 사이드바) */
        .jenny-layout-wrapper {
            display: flex;
            flex-direction: column;
            width: 100%;
            max-width: 100%;
            position: relative;
        }
        
        /* 메인 콘텐츠 영역 */
        .jenny-main-content {
            flex: 1;
            min-width: 0;
            width: 100%;
        }
        
        /* PC에서 사이드바 공간 확보 */
        @media (min-width: 1400px) {
            .jenny-layout-wrapper {
                flex-direction: row;
            }
            .jenny-main-content {
                flex: 1;
                margin-right: 200px; /* 사이드바 공간 확보 */
            }
        }
        
        /* 광고 섹션 공통 스타일 */
        .jenny-ad-section {
            margin: 24px 0;
            text-align: center;
            width: 100%;
        }
        
        .jenny-ad-placeholder {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border: 2px dashed #dee2e6;
            border-radius: 8px;
            padding: 30px 20px;
            color: #6c757d;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100px;
        }
        
        /* 상단 전면 광고 (더 크고 눈에 띔) */
        .jenny-ad-top-banner {
            margin: 0 0 24px 0;
        }
        .jenny-ad-top-banner .jenny-ad-large {
            background: linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%);
            border-color: #ffc107;
            min-height: 180px; /* 모바일: 더 높은 광고 */
            padding: 40px 20px;
            font-size: 14px;
        }
        @media (min-width: 768px) {
            .jenny-ad-top-banner .jenny-ad-large {
                min-height: 200px; /* PC: 더 높음 */
            }
        }
        
        /* 뉴스 4개당 중간 광고 */
        .jenny-ad-inline {
            margin: 20px 0;
        }
        .jenny-ad-inline .jenny-ad-placeholder {
            min-height: 150px; /* 100px에서 50% 증가 */
            padding: 35px 20px;
        }
        
        /* 섹션 끝 광고 */
        .jenny-ad-section:not(.jenny-ad-top-banner):not(.jenny-ad-inline) .jenny-ad-placeholder {
            min-height: 150px; /* 100px에서 50% 증가 */
        }
        
        /* 사이드바 광고 (PC에서만 표시) */
        .jenny-sidebar-ad {
            display: none; /* 기본: 숨김 (모바일) */
        }
        
        @media (min-width: 1400px) {
            .jenny-sidebar-ad {
                display: block;
                position: absolute;
                top: 0;
                right: 0;
                width: 180px;
                height: 100%;
            }
            .jenny-sidebar-ad-inner {
                position: sticky;
                top: 100px; /* 상단에서 100px 떨어진 위치에 고정 */
                padding: 10px;
            }
            .jenny-ad-sidebar {
                width: 160px;
                min-height: 300px;
                padding: 20px 10px;
                font-size: 12px;
                flex-direction: column;
            }
        }
        
        /* 모바일 광고 최적화 */
        @media (max-width: 768px) {
            .jenny-ad-section {
                margin: 16px 0;
            }
            .jenny-ad-placeholder {
                padding: 20px 15px;
                font-size: 12px;
                min-height: 120px; /* 80px에서 50% 증가 */
            }
            .jenny-ad-top-banner .jenny-ad-large {
                min-height: 150px;
                padding: 30px 15px;
            }
            .jenny-ad-inline .jenny-ad-placeholder {
                min-height: 120px; /* 80px에서 50% 증가 */
                padding: 25px 15px;
            }
        }
        
        /* 섹션 뉴스 모달 스타일 */
        .jenny-section-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 10000;
            overflow-y: auto;
        }
        .jenny-section-modal.show {
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 20px;
        }
        .jenny-section-modal-content {
            background: #ffffff;
            border-radius: 16px;
            max-width: 800px;
            width: 100%;
            margin-top: 40px;
            margin-bottom: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            animation: jennyModalSlideIn 0.3s ease;
        }
        @keyframes jennyModalSlideIn {
            from { opacity: 0; transform: translateY(-30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .jenny-section-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border-radius: 16px 16px 0 0;
        }
        .jenny-section-modal-title {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: #92400e;
        }
        .jenny-section-modal-close {
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: #6b7280;
            padding: 0;
            line-height: 1;
        }
        .jenny-section-modal-close:hover {
            color: #111827;
        }
        .jenny-section-news-container {
            padding: 20px;
            max-height: 60vh;
            overflow-y: auto;
        }
        .jenny-section-loading,
        .jenny-section-error {
            text-align: center;
            padding: 40px 20px;
            color: #6b7280;
        }
        .jenny-section-error {
            color: #dc2626;
        }
        .jenny-section-news-card {
            display: flex;
            gap: 16px;
            padding: 16px;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            margin-bottom: 12px;
            transition: box-shadow 0.2s ease;
        }
        .jenny-section-news-card:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .jenny-section-card-image {
            flex-shrink: 0;
            width: 120px;
            height: 80px;
            border-radius: 8px;
            overflow: hidden;
        }
        .jenny-section-card-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .jenny-section-card-content {
            flex: 1;
            min-width: 0;
        }
        .jenny-section-card-title {
            margin: 0 0 8px 0;
            font-size: 15px;
            font-weight: 600;
            line-height: 1.4;
        }
        .jenny-section-card-title a {
            color: #111827;
            text-decoration: none;
        }
        .jenny-section-card-title a:hover {
            color: #ea580c;
        }
        .jenny-section-card-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 8px;
        }
        .jenny-section-sep {
            color: #d1d5db;
        }
        .jenny-section-original {
            color: #3b82f6;
            text-decoration: none;
        }
        .jenny-section-original:hover {
            text-decoration: underline;
        }
        .jenny-section-card-excerpt {
            margin: 0;
            font-size: 13px;
            color: #4b5563;
            line-height: 1.5;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .jenny-section-load-more {
            display: block;
            width: calc(100% - 40px);
            margin: 0 20px 20px 20px;
            padding: 12px;
            background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        .jenny-section-load-more:hover {
            transform: scale(1.02);
        }
        
        /* 모바일 반응형 */
        @media (max-width: 768px) {
            .jenny-section-modal.show {
                padding: 10px;
            }
            .jenny-section-modal-content {
                margin-top: 20px;
                margin-bottom: 20px;
            }
            .jenny-section-news-card {
                flex-direction: column;
                gap: 12px;
            }
            .jenny-section-card-image {
                width: 100%;
                height: 160px;
            }
        }

    </style>';
}

// ============================================================================
// 앱 딥링크 배너 (App Deep Link Banner)
// ============================================================================

/**
 * 앱 설치 유도 배너 출력
 * SNS에서 유입된 모바일 사용자에게 앱 설치/열기 안내
 */
function jenny_app_banner_script()
{
    // chaovn-deeplink-handler 플러그인의 팝업으로 대체됨 — 이 배너는 비활성화
    return;

    // daily-news 페이지에서만 실행
    if (!is_page() || strpos($_SERVER['REQUEST_URI'], 'daily-news') === false) {
        return;
    }
    ?>
    <style>
        /* 앱 배너 스타일 */
        .jenny-app-banner-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 99999;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(4px);
        }

        .jenny-app-banner-overlay.show {
            display: flex;
        }

        .jenny-app-banner {
            background: #ffffff;
            border-radius: 20px;
            padding: 32px 24px;
            max-width: 340px;
            width: 90%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            animation: jennyBannerSlideUp 0.3s ease-out;
        }

        @keyframes jennyBannerSlideUp {
            from {
                transform: translateY(30px);
                opacity: 0;
            }

            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .jenny-app-banner-icon {
            width: 72px;
            height: 72px;
            background: linear-gradient(135deg, #ea580c, #f97316);
            border-radius: 16px;
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
        }

        .jenny-app-banner-title {
            font-size: 20px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 8px;
        }

        .jenny-app-banner-desc {
            font-size: 14px;
            color: #6b7280;
            line-height: 1.5;
            margin-bottom: 24px;
        }

        .jenny-app-banner-btn {
            display: block;
            width: 100%;
            padding: 14px 20px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            border: none;
            margin-bottom: 12px;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .jenny-app-banner-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .jenny-app-banner-btn-primary {
            background: linear-gradient(135deg, #ea580c, #f97316);
            color: #ffffff;
        }

        .jenny-app-banner-btn-secondary {
            background: #f3f4f6;
            color: #374151;
        }

        .jenny-app-banner-dismiss {
            font-size: 12px;
            color: #9ca3af;
            cursor: pointer;
            margin-top: 8px;
        }

        .jenny-app-banner-dismiss:hover {
            color: #6b7280;
        }
    </style>

    <div id="jennyAppBanner" class="jenny-app-banner-overlay">
        <div class="jenny-app-banner">
            <div class="jenny-app-banner-icon">📱</div>
            <div class="jenny-app-banner-title">씬짜오베트남 앱</div>
            <div class="jenny-app-banner-desc">
                앱으로 보시면 훨씬 빠르고<br>편리하게 이용하실 수 있습니다!
            </div>
            <button class="jenny-app-banner-btn jenny-app-banner-btn-primary" onclick="jennyOpenApp()">
                📲 앱으로 보기
            </button>
            <button class="jenny-app-banner-btn jenny-app-banner-btn-secondary" onclick="jennyCloseBanner()">
                웹에서 계속 보기
            </button>
            <div class="jenny-app-banner-dismiss" onclick="jennyDismissBanner()">
                다시 보지 않기
            </div>
        </div>
    </div>

    <script>
        (function () {
            // 설정값
            var APP_SCHEME = 'xinchao://';
            var IOS_STORE = 'https://apps.apple.com/app/id6754750793';
            var ANDROID_STORE = 'https://play.google.com/store/apps/details?id=com.yourname.chaovnapp';

            // 모바일 체크
            function isMobile() {
                return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            }

            // iOS 체크
            function isIOS() {
                return /iPhone|iPad|iPod/i.test(navigator.userAgent);
            }

            // 앱 선호 여부 확인 (영구 저장)
            function prefersApp() {
                return localStorage.getItem('jenny_prefer_app') === 'true';
            }

            // 배너 표시 여부 결정
            function shouldShowBanner() {
                // 모바일만
                if (!isMobile()) return false;

                // "다시 보지 않기" 선택했으면 영구적으로 표시 안함
                if (localStorage.getItem('jenny_app_banner_dismissed') === 'true') {
                    return false;
                }

                // 세션에서 이미 닫았으면 표시 안함
                if (sessionStorage.getItem('jenny_app_banner_closed')) {
                    return false;
                }

                return true;
            }

            // 앱 열기 시도 (배너 없이)
            function tryOpenAppSilently() {
                var appUrl = APP_SCHEME + 'daily-news';
                var storeUrl = isIOS() ? IOS_STORE : ANDROID_STORE;

                // 앱 열기 시도
                var iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = appUrl;
                document.body.appendChild(iframe);

                // 2.5초 후에도 페이지가 보이면 앱이 없는 것 → 배너 표시
                setTimeout(function () {
                    try { document.body.removeChild(iframe); } catch (e) { }
                    if (!document.hidden) {
                        // 앱이 안 열렸으므로 선호도 초기화하고 배너 표시
                        localStorage.removeItem('jenny_prefer_app');
                        document.getElementById('jennyAppBanner').classList.add('show');
                    }
                }, 2500);
            }

            // 앱 열기 (배너에서 클릭)
            window.jennyOpenApp = function () {
                var storeUrl = isIOS() ? IOS_STORE : ANDROID_STORE;
                var appUrl = APP_SCHEME + 'daily-news';

                // 앱 선호 설정 저장 (영구)
                localStorage.setItem('jenny_prefer_app', 'true');

                // 앱 열기 시도
                var iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = appUrl;
                document.body.appendChild(iframe);

                // 2.5초 후에도 앱이 안 열렸으면 스토어로
                setTimeout(function () {
                    try { document.body.removeChild(iframe); } catch (e) { }
                    if (!document.hidden) {
                        window.location.href = storeUrl;
                    }
                }, 2500);

                jennyCloseBanner();
            };

            // 배너 닫기 (세션 동안)
            window.jennyCloseBanner = function () {
                document.getElementById('jennyAppBanner').classList.remove('show');
                sessionStorage.setItem('jenny_app_banner_closed', 'true');
            };

            // 배너 다시 보지 않기 (영구)
            window.jennyDismissBanner = function () {
                document.getElementById('jennyAppBanner').classList.remove('show');
                localStorage.setItem('jenny_app_banner_dismissed', 'true');
            };

            // 페이지 로드 시
            document.addEventListener('DOMContentLoaded', function () {
                if (!isMobile()) return;

                // "다시 보지 않기" 했으면 아무것도 안함
                if (localStorage.getItem('jenny_app_banner_dismissed') === 'true') {
                    return;
                }

                // 앱 선호 설정이 있으면 배너 없이 바로 앱 열기 시도
                if (prefersApp()) {
                    setTimeout(function () {
                        tryOpenAppSilently();
                    }, 500);
                    return;
                }

                // 첫 방문이면 배너 표시
                if (shouldShowBanner()) {
                    setTimeout(function () {
                        document.getElementById('jennyAppBanner').classList.add('show');
                    }, 1000);
                }
            });
        })();
    </script>
    <?php
}
add_action('wp_footer', 'jenny_app_banner_script');

// ============================================================================
// AJAX 핸들러: 지난 뉴스 날짜 목록 (첫 로딩 속도 최적화)
// ============================================================================

/**
 * 지난 뉴스 날짜 목록을 AJAX로 가져오기
 */
function jenny_get_archive_dates_ajax()
{
    // Nonce 체크 (선택적 - 공개 데이터이므로)
    $category_id = isset($_POST['category']) ? intval($_POST['category']) : 31;
    $page_url = isset($_POST['page_url']) ? esc_url($_POST['page_url']) : '';
    $selected_date = isset($_POST['selected']) ? sanitize_text_field($_POST['selected']) : '';

    // 베트남 시간대
    $tz = new DateTimeZone('Asia/Ho_Chi_Minh');
    $now = new DateTime('now', $tz);
    $today = $now->format('Y-m-d');

    // 최근 발행일 가져오기 (오늘 뉴스의 날짜)
    $latest_args = array(
        'post_type' => 'post',
        'posts_per_page' => 1,
        'cat' => $category_id,
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
    );
    $latest_query = new WP_Query($latest_args);
    $board_date = $today;
    if ($latest_query->have_posts()) {
        $latest_query->the_post();
        $board_date = get_the_date('Y-m-d');
        wp_reset_postdata();
    }

    // 지난 날짜 목록 가져오기 (최근 60일치만 - 성능 최적화)
    $date_args = array(
        'post_type' => 'post',
        'posts_per_page' => 200, // 최대 200개 포스트만 (약 60일치)
        'cat' => $category_id,
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => true,
        'date_query' => array(
            array(
                'before' => $board_date,
                'inclusive' => false,
            ),
        ),
    );
    $date_query = new WP_Query($date_args);
    $available_dates = array();
    while ($date_query->have_posts()) {
        $date_query->the_post();
        $post_date = get_the_date('Y-m-d');
        if ($post_date !== $board_date && !in_array($post_date, $available_dates)) {
            $available_dates[] = $post_date;
        }
    }
    wp_reset_postdata();

    // HTML 생성
    $html = '';
    if (!empty($available_dates)) {
        foreach ($available_dates as $date) {
            $date_obj = new DateTime($date);
            $date_display = $date_obj->format('Y') . '년 ' . $date_obj->format('m') . '월 ' . $date_obj->format('d') . '일';
            $date_class = ($selected_date === $date) ? ' selected' : '';
            $html .= '<a href="' . esc_url(add_query_arg('news_date', $date, $page_url)) . '" class="jenny-date-option' . $date_class . '">' . esc_html($date_display) . '</a>';
        }
    } else {
        $html = '<div class="jenny-date-option jenny-no-dates">지난 뉴스가 없습니다.</div>';
    }

    wp_send_json_success(array('html' => $html));
}
add_action('wp_ajax_jenny_get_archive_dates', 'jenny_get_archive_dates_ajax');
add_action('wp_ajax_nopriv_jenny_get_archive_dates', 'jenny_get_archive_dates_ajax');

/**
 * AJAX URL을 프론트엔드에 전달
 */
function jenny_enqueue_ajax_script()
{
    // daily-news 페이지에서만 로드
    if (!is_page() || strpos($_SERVER['REQUEST_URI'], 'daily-news') === false) {
        return;
    }
    ?>
    <script>
        var jennyAjax = {
            ajaxurl: '<?php echo admin_url('admin-ajax.php'); ?>'
        };
    </script>
    <?php
}
add_action('wp_head', 'jenny_enqueue_ajax_script');

// ============================================================================
// AJAX 핸들러: 섹션별 뉴스 로드 (카테고리별 최신 뉴스)
// ============================================================================

/**
 * 섹션(카테고리)별 뉴스를 AJAX로 가져오기
 * - 날짜 무관 최신순으로 로드
 * - 페이지네이션 지원 (더 보기)
 */
function jenny_get_section_news_ajax()
{
    $section_key = isset($_POST['section']) ? sanitize_text_field($_POST['section']) : '';
    $page = isset($_POST['page']) ? intval($_POST['page']) : 1;
    $per_page = 10;
    $category_id = isset($_POST['category_id']) ? intval($_POST['category_id']) : 31;

    if (empty($section_key)) {
        wp_send_json_error(array('message' => 'Section key is required'));
        return;
    }

    // 섹션 키에서 카테고리 이름들 가져오기
    $sections_keys = jenny_get_sections_keys();
    $sections = jenny_get_sections();
    $category_map = jenny_get_category_map();

    if (!isset($sections_keys[$section_key])) {
        wp_send_json_error(array('message' => 'Invalid section key'));
        return;
    }

    $category_names = $sections_keys[$section_key];
    $section_title = isset($sections[$section_key]) ? $sections[$section_key]['title'] : $section_key;

    // 해당 카테고리의 뉴스 가져오기
    $args = array(
        'post_type' => 'post',
        'posts_per_page' => $per_page,
        'paged' => $page,
        'cat' => $category_id,
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
        'meta_query' => array(
            array(
                'key' => 'news_category',
                'value' => $category_names,
                'compare' => 'IN'
            )
        )
    );

    $query = new WP_Query($args);
    $posts_html = '';
    $has_more = false;

    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $post_id = get_the_ID();

            // 썸네일
            $thumb_url = get_the_post_thumbnail_url($post_id, 'medium');
            if (!$thumb_url) {
                $thumb_url = 'https://via.placeholder.com/300x200?text=News';
            }

            // 카테고리
            $news_category = get_post_meta($post_id, 'news_category', true);
            $cat_display = isset($category_map[$news_category]) ? $category_map[$news_category] : $news_category;

            // 날짜
            $date_str = get_the_date('Y.m.d');

            // 출처
            $news_source = get_post_meta($post_id, 'news_source', true);
            if (empty($news_source)) {
                $categories = get_the_category($post_id);
                $news_source = !empty($categories) ? $categories[0]->name : '';
            }

            // 원문 링크
            $original_url = get_post_meta($post_id, 'news_original_url', true);

            // 요약문
            $excerpt = get_post_meta($post_id, 'news_summary', true);
            if (empty($excerpt)) {
                $excerpt = get_the_excerpt();
            }
            if (empty($excerpt)) {
                $excerpt = wp_trim_words(strip_tags(get_the_content()), 30, '...');
            }

            $permalink = get_permalink();

            // 카드 HTML
            $posts_html .= '<div class="jenny-section-news-card">';
            $posts_html .= '<div class="jenny-section-card-image">';
            $posts_html .= '<a href="' . esc_url($permalink) . '">';
            $posts_html .= '<img src="' . esc_url($thumb_url) . '" alt="' . esc_attr(get_the_title()) . '" loading="lazy">';
            $posts_html .= '</a>';
            $posts_html .= '</div>';
            $posts_html .= '<div class="jenny-section-card-content">';
            $posts_html .= '<h4 class="jenny-section-card-title"><a href="' . esc_url($permalink) . '">' . get_the_title() . '</a></h4>';
            $posts_html .= '<div class="jenny-section-card-meta">';
            if (!empty($news_source)) {
                $posts_html .= '<span class="jenny-section-source">' . esc_html($news_source) . '</span>';
                $posts_html .= '<span class="jenny-section-sep">|</span>';
            }
            $posts_html .= '<span class="jenny-section-date">' . $date_str . '</span>';
            if (!empty($original_url)) {
                $posts_html .= '<span class="jenny-section-sep">|</span>';
                $posts_html .= '<a href="' . esc_url($original_url) . '" target="_blank" class="jenny-section-original">원문</a>';
            }
            $posts_html .= '</div>';
            $posts_html .= '<p class="jenny-section-card-excerpt">' . esc_html($excerpt) . '</p>';
            $posts_html .= '</div>';
            $posts_html .= '</div>';
        }

        // 더 있는지 확인
        $has_more = ($query->max_num_pages > $page);
    }

    wp_reset_postdata();

    wp_send_json_success(array(
        'html' => $posts_html,
        'has_more' => $has_more,
        'page' => $page,
        'section_title' => $section_title
    ));
}
add_action('wp_ajax_jenny_get_section_news', 'jenny_get_section_news_ajax');
add_action('wp_ajax_nopriv_jenny_get_section_news', 'jenny_get_section_news_ajax');

// ============================================================================
// REST API 엔드포인트: 섹션별 뉴스 (앱용)
// ============================================================================

/**
 * REST API 엔드포인트 등록
 */
add_action('rest_api_init', function () {
    // 섹션별 뉴스 API
    register_rest_route('jenny/v1', '/section-news', array(
        'methods' => 'GET',
        'callback' => 'jenny_get_section_news_rest',
        'permission_callback' => '__return_true',
    ));

    // 섹션 목록 API (앱에서 동적으로 가져갈 수 있음)
    register_rest_route('jenny/v1', '/sections', array(
        'methods' => 'GET',
        'callback' => 'jenny_get_sections_list_rest',
        'permission_callback' => '__return_true',
    ));
});

/**
 * REST API 핸들러: 섹션 목록 반환 (앱에서 동적으로 가져감)
 */
function jenny_get_sections_list_rest($request)
{
    $nav_items = jenny_get_section_nav_items();
    $sections = array();

    foreach ($nav_items as $key => $info) {
        $sections[] = array(
            'key' => $key,
            'label' => $info['label'],
            'icon' => $info['icon'],
        );
    }

    return new WP_REST_Response(array(
        'success' => true,
        'data' => $sections,
        'total' => count($sections),
    ), 200);
}

/**
 * 섹션 키 매핑 (앱 categoryKey → WordPress 섹션 키)
 */
function jenny_map_section_key($key)
{
    $mapping = array(
        'Economy' => 'economy',
        'Society' => 'society',
        'Culture' => 'culture',
        'Politics' => 'politics',
        'International' => 'international',
        'Korea-Vietnam' => 'korea_vietnam',
        'Travel' => 'travel',
        'Health' => 'health',
        'Food' => 'food',
        'Real Estate' => 'real_estate',
        'Community' => 'community',
        'Other' => 'other',
    );

    // 이미 소문자 키면 그대로 반환
    if (isset($mapping[$key])) {
        return $mapping[$key];
    }

    // 소문자로 변환해서 확인
    $lower_key = strtolower(str_replace('-', '_', $key));
    $sections_keys = jenny_get_sections_keys();
    if (isset($sections_keys[$lower_key])) {
        return $lower_key;
    }

    return $key;
}

/**
 * REST API 핸들러: 섹션별 뉴스 (JSON 반환)
 */
function jenny_get_section_news_rest($request)
{
    $section_key_raw = $request->get_param('section');
    $page = intval($request->get_param('page')) ?: 1;
    $per_page = intval($request->get_param('per_page')) ?: 10;
    $category_id = intval($request->get_param('category_id')) ?: 31;

    if (empty($section_key_raw)) {
        return new WP_Error('missing_section', 'Section parameter is required', array('status' => 400));
    }

    // 섹션 키 매핑
    $section_key = jenny_map_section_key($section_key_raw);

    // 섹션 키에서 카테고리 이름들 가져오기
    $sections_keys = jenny_get_sections_keys();
    $sections = jenny_get_sections();
    $category_map = jenny_get_category_map();

    if (!isset($sections_keys[$section_key])) {
        return new WP_Error('invalid_section', 'Invalid section key: ' . $section_key_raw, array('status' => 400));
    }

    $category_names = $sections_keys[$section_key];
    $section_title = isset($sections[$section_key]) ? $sections[$section_key]['title'] : $section_key;

    // 해당 카테고리의 뉴스 가져오기
    $args = array(
        'post_type' => 'post',
        'posts_per_page' => $per_page,
        'paged' => $page,
        'cat' => $category_id,
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
        'meta_query' => array(
            array(
                'key' => 'news_category',
                'value' => $category_names,
                'compare' => 'IN'
            )
        )
    );

    $query = new WP_Query($args);
    $posts = array();

    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $post_id = get_the_ID();

            // 썸네일
            $thumb_url = get_the_post_thumbnail_url($post_id, 'medium');
            if (!$thumb_url) {
                $thumb_url = '';
            }

            // 메타 데이터
            $news_category = get_post_meta($post_id, 'news_category', true);
            $news_source = get_post_meta($post_id, 'news_source', true);
            $original_url = get_post_meta($post_id, 'news_original_url', true);

            // 요약문
            $excerpt = get_post_meta($post_id, 'news_summary', true);
            if (empty($excerpt)) {
                $excerpt = get_the_excerpt();
            }
            if (empty($excerpt)) {
                $excerpt = wp_trim_words(strip_tags(get_the_content()), 30, '...');
            }

            $posts[] = array(
                'id' => $post_id,
                'title' => get_the_title(),
                'excerpt' => $excerpt,
                'date' => get_the_date('Y-m-d'),
                'dateFormatted' => get_the_date('Y.m.d'),
                'link' => get_permalink(),
                'thumbnail' => $thumb_url,
                'meta' => array(
                    'news_category' => $news_category,
                    'news_source' => $news_source,
                    'news_original_url' => $original_url,
                ),
                '_embedded' => array(
                    'wp:featuredmedia' => $thumb_url ? array(array('source_url' => $thumb_url)) : array()
                )
            );
        }
    }

    wp_reset_postdata();

    $has_more = ($query->max_num_pages > $page);

    return rest_ensure_response(array(
        'success' => true,
        'posts' => $posts,
        'has_more' => $has_more,
        'page' => $page,
        'total_pages' => $query->max_num_pages,
        'total_posts' => $query->found_posts,
        'section_key' => $section_key,
        'section_title' => $section_title,
    ));
}

// Note: REST API 엔드포인트는 이미 2499번 줄에 등록되어 있음 (jenny/v1/section-news, jenny/v1/sections)