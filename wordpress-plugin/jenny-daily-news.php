<?php
/**
 * Plugin Name: Jenny Daily News Display
 * Description: Displays daily news in a beautiful card layout using the shortcode [daily_news_list]. Shows excerpt and links to full article. Includes weather and exchange rate info.
 * Version: 1.8
 * Author: Jenny (Antigravity)
 */

if (!defined('ABSPATH')) {
    exit;
}

function jenny_get_weather_html()
{
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



function jenny_daily_news_shortcode($atts)
{
    $atts = shortcode_atts(array(
        'count' => -1,
        'category' => 31,
    ), $atts);

    $selected_date = '';
    if (isset($_GET['news_date'])) {
        $selected_date = sanitize_text_field($_GET['news_date']);
    }
    $is_filtered = ($selected_date !== '');

    // 오늘 날짜 (WordPress 타임존 기준)
    $today = current_time('Y-m-d');

    $args = array(
        'post_type' => 'post',
        'posts_per_page' => -1,
        'cat' => intval($atts['category']),
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
    );

    // 날짜 필터 적용 (선택된 날짜 또는 오늘)
    $filter_date = $is_filtered ? $selected_date : $today;
    $date_parts = explode('-', $filter_date);
    if (count($date_parts) === 3) {
        $args['date_query'] = array(
            array(
                'year' => intval($date_parts[0]),
                'month' => intval($date_parts[1]),
                'day' => intval($date_parts[2]),
            ),
        );
    }

    $query = new WP_Query($args);

    // 카테고리 순서 정의
    $category_order = array(
        '사회' => 1,
        'Society' => 1,
        '경제' => 2,
        'Economy' => 2,
        '문화' => 3,
        'Culture' => 3,
        '정치' => 4,
        'Politics' => 4,
        'Policy' => 4, // Backward compat with Policy
        '국제' => 5,
        'International' => 5,
        '한베' => 6,
        'Korea-Vietnam' => 6,
        '한-베' => 6,
        '교민' => 7,
        '교민소식' => 7,
        'Community' => 7,
    );

    // 뉴스를 카테고리별로 정렬하고 Top News 분리
    $sorted_posts = array();
    $top_news_posts = array();
    $regular_posts = array();

    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $post_id = get_the_ID();

            // 카테고리 확인
            $news_category = get_post_meta($post_id, 'news_category', true);
            if (empty($news_category)) {
                $categories = get_the_category();
                $news_category = !empty($categories) ? $categories[0]->name : '뉴스';
            }

            // Top News 확인 - 명시적으로 체크 (문자열 '1', 숫자 1, boolean true 모두 처리)
            $is_top_raw = get_post_meta($post_id, 'is_top_news', true);
            $is_top = ($is_top_raw === '1' || $is_top_raw === 1 || $is_top_raw === true || $is_top_raw === 'true');

            // 순서 결정
            $order = isset($category_order[$news_category]) ? $category_order[$news_category] : 99;

            $item = array(
                'post_id' => $post_id,
                'order' => $order,
                'date' => get_the_date('Y-m-d H:i:s'),
                'category' => $news_category,
                'is_top' => $is_top  // 디버깅용으로 저장
            );

            if ($is_top) {
                $top_news_posts[] = $item;
            } else {
                $regular_posts[] = $item;
            }
        }
        wp_reset_postdata();

        // 정렬 함수
        $sort_func = function ($a, $b) {
            if ($a['order'] === $b['order']) {
                return strcmp($b['date'], $a['date']);
            }
            return $a['order'] - $b['order'];
        };

        usort($top_news_posts, $sort_func);
        usort($regular_posts, $sort_func);
    }

    $date_args = array(
        'post_type' => 'post',
        'posts_per_page' => 100,
        'cat' => intval($atts['category']),
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
    );
    $date_query = new WP_Query($date_args);
    $available_dates = array();
    while ($date_query->have_posts()) {
        $date_query->the_post();
        $post_date = get_the_date('Y-m-d');
        if (!in_array($post_date, $available_dates)) {
            $available_dates[] = $post_date;
        }
    }
    wp_reset_postdata();

    $page_url = get_permalink();

    $exchange = jenny_get_exchange_data();

    $output = '<div class="jenny-date-filter">';

    // ... (Filter Header Code remains mostly same, condensed for brevity) ...
    $output .= '<div class="jenny-info-bar">';
    $output .= '<div class="jenny-info-card jenny-weather-card"><div class="jenny-card-header"><span class="jenny-card-icon">🌤</span><span class="jenny-card-title">오늘의 날씨</span><span class="jenny-card-source">(Open-Meteo)</span></div><div class="jenny-card-chips">' . jenny_get_weather_fallback() . '</div></div>';

    $output .= '<div class="jenny-info-card jenny-fx-card"><div class="jenny-card-header"><span class="jenny-card-icon">💱</span><span class="jenny-card-title">환율</span><span class="jenny-card-source">(ECB 기준)</span></div><div class="jenny-card-chips">';
    $output .= '<div class="jenny-fx-chip"><span class="jenny-fx-flag">🇺🇸</span><span class="jenny-fx-label">1 USD</span><span class="jenny-fx-value">' . esc_html($exchange['usd']) . '₫</span></div>';
    $output .= '<div class="jenny-fx-chip"><span class="jenny-fx-flag">🇰🇷</span><span class="jenny-fx-label">100 KRW</span><span class="jenny-fx-value">' . esc_html($exchange['krw_100']) . '₫</span></div>';
    $output .= '</div></div>';

    $output .= '<div class="jenny-filter-buttons">';
    $output .= $is_filtered ? '<a href="' . esc_url($page_url) . '" class="jenny-filter-btn">오늘의 뉴스</a>' : '<span class="jenny-filter-btn active">오늘의 뉴스</span>';

    $output .= '<div class="jenny-archive-wrapper"><span class="jenny-filter-btn jenny-archive-btn' . ($is_filtered ? ' active' : '') . '">지난 뉴스 보기 ▼</span>';
    $output .= '<div class="jenny-date-dropdown">';
    foreach ($available_dates as $date) {
        $date_obj = new DateTime($date);
        $date_display = $date_obj->format('Y') . '년 ' . $date_obj->format('m') . '월 ' . $date_obj->format('d') . '일';
        $date_class = ($selected_date === $date) ? ' selected' : '';
        $output .= '<a href="' . esc_url(add_query_arg('news_date', $date, $page_url)) . '" class="jenny-date-option' . $date_class . '">' . esc_html($date_display) . '</a>';
    }
    $output .= '</div></div></div></div>'; // Close info-bar, filter-buttons, date-filter

    if ($is_filtered) {
        $sel_date_obj = new DateTime($selected_date);
        $display_date = $sel_date_obj->format('Y') . '년 ' . $sel_date_obj->format('m') . '월 ' . $sel_date_obj->format('d') . '일';
        $output .= '<div class="jenny-filter-info">' . esc_html($display_date) . ' 뉴스를 보고 있습니다. <a href="' . esc_url($page_url) . '">오늘의 뉴스로 돌아가기</a></div>';
    }

    $output .= '</div>'; // Close jenny-date-filter

    if (empty($top_news_posts) && empty($regular_posts)) {
        $output .= '<p style="text-align:center; padding: 40px 20px; color: #6b7280;">선택한 날짜에 등록된 뉴스가 없습니다.</p>';
        $output .= jenny_get_styles();
        return $output;
    }

    $category_map = array(
        'Society' => '사회',
        'Economy' => '경제',
        'Culture' => '문화',
        'Policy' => '정치',
        'Politics' => '정치',
        'International' => '국제',
        'Korea-Vietnam' => '한-베',
        'Community' => '교민소식',
    );

    // Helpers for rendering
    function render_jenny_card($post_data, $category_map)
    {
        $post_obj = get_post($post_data['post_id']);
        setup_postdata($post_obj);

        $thumb_url = get_the_post_thumbnail_url($post_data['post_id'], 'medium_large');
        if (!$thumb_url) {
            $thumb_url = 'https://via.placeholder.com/600x400?text=News';
        }

        $news_category = $post_data['category'];
        if (!empty($news_category)) {
            $cat_name = isset($category_map[$news_category]) ? $category_map[$news_category] : $news_category;
        } else {
            $cat_name = '뉴스';
        }

        $excerpt = get_the_excerpt($post_data['post_id']);
        if (empty($excerpt)) {
            $excerpt = wp_trim_words($post_obj->post_content, 22, '...');
        }

        // Prefer original source URL if available, else permalink
        $permalink = get_permalink($post_data['post_id']);
        $original_url = get_post_meta($post_data['post_id'], 'news_original_url', true);
        $link_url = !empty($original_url) ? $original_url : $permalink;

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
        $html .= '<a href="' . esc_url($link_url) . '">';
        $html .= '<img src="' . esc_url($thumb_url) . '" alt="' . esc_attr(get_the_title($post_data['post_id'])) . '">';
        $html .= '</a>';
        // Badge removed for flat design preference? Or kept? User asked for "flat". Let's keep badge but simple.
        $html .= '<span class="jenny-badge">' . esc_html($cat_name) . '</span>';
        $html .= '</div>';

        $html .= '<div class="jenny-content">';
        $html .= '<h3 class="jenny-title"><a href="' . esc_url($link_url) . '">' . get_the_title($post_data['post_id']) . '</a></h3>';
        $html .= $meta_line; // Insert Meta Line below title
        $html .= '<div class="jenny-excerpt">' . $excerpt . '</div>';
        // "자세히 보기"는 WP 본문으로 이동
        $html .= '<a href="' . esc_url($permalink) . '" class="jenny-link"><span class="jenny-link-text">자세히 보기</span></a>';
        $html .= '</div>';
        $html .= '</div>';

        return $html;
    }

    // Numbers 1 & 2 logic remains same...

    // --- 1. Top News Section (First 2 Top News) ---
    if (!empty($top_news_posts)) {
        $output .= '<h2 class="jenny-section-title">🔥 주요 뉴스</h2>';
        // 탑뉴스는 반드시 2열 그리드로 표시 (jenny-top-news-row 클래스 사용)
        $output .= '<div class="jenny-top-news-row jenny-top-news-container">';
        $top_count = 0;
        foreach ($top_news_posts as $post) {
            if ($top_count >= 2) {
                // If extra top news, add to regular posts instead of discarding
                // Note: In the new logic, we need to add them to the correct CATEGORY bucket
                // For simplicity, let's treat them as regular posts and process them below
                $regular_posts[] = $post;
                continue;
            }
            $output .= render_jenny_card($post, $category_map);
            $top_count++;
        }
        $output .= '</div>'; // Close jenny-top-news-row

        // Ad Slot after Top News
        $output .= '<div class="jenny-ad-section"><div class="jenny-ad-placeholder"><span>Google Ads / Banner Area (Top News)</span></div></div>';
    }

    // --- 2. Section-Based Logic ---

    // Define Sections and their Category Keys
    // Keys match the 'news_category' or mapped name
    $sections = array(
        'economy' => array('title' => '📈 경제 (Economy)', 'keys' => array('Economy', '경제')),
        'society' => array('title' => '👥 사회 (Society)', 'keys' => array('Society', '사회')),
        'culture' => array('title' => '🎭 문화/라이프 (Culture)', 'keys' => array('Culture', '문화')),
        'politics' => array('title' => '⚖️ 정치/정책 (Politics)', 'keys' => array('Politics', 'Policy', '정치', '정책')),
        'international' => array('title' => '🌏 국제 (International)', 'keys' => array('International', '국제')),
        'korea_vietnam' => array('title' => '🇰🇷🇻🇳 한-베 관계 (Korea-Vietnam)', 'keys' => array('Korea-Vietnam', '한-베', '한베')),
        'community' => array('title' => '📢 교민 소식 (Community)', 'keys' => array('Community', '교민', '교민소식')),
        'other' => array('title' => '✨ 기타 뉴스', 'keys' => array()) // Fallback
    );

    // Bucket posts into sections
    $grouped_posts = array();
    foreach ($regular_posts as $post) {
        $cat = $post['category']; // Original category string
        $found = false;

        // Find which section this post belongs to
        foreach ($sections as $sec_key => $sec_info) {
            if ($sec_key === 'other')
                continue;

            if (in_array($cat, $sec_info['keys'])) {
                $grouped_posts[$sec_key][] = $post;
                $found = true;
                break;
            }
        }

        if (!$found) {
            $grouped_posts['other'][] = $post;
        }
    }

    // sort function reused
    $sort_func = function ($a, $b) {
        return strcmp($b['date'], $a['date']); // Sort by date DESC within section
    };

    // --- 3. Render Sections ---
    foreach ($sections as $sec_key => $sec_info) {
        if (!empty($grouped_posts[$sec_key])) {
            // Sort
            usort($grouped_posts[$sec_key], $sort_func);

            $output .= '<h2 class="jenny-section-title">' . esc_html($sec_info['title']) . '</h2>';
            $output .= '<div class="jenny-news-grid">'; // 4-column grid

            foreach ($grouped_posts[$sec_key] as $post) {
                $output .= render_jenny_card($post, $category_map);
            }

            $output .= '</div>';

            // AD SLOT after each section
            $output .= '<div class="jenny-ad-section"><div class="jenny-ad-placeholder"><span>Google Ads / Banner Area (' . esc_html($sec_info['title']) . ')</span></div></div>';
        }
    }

    wp_reset_postdata();
    $output .= jenny_get_styles();

    return $output;
}
add_shortcode('daily_news_list', 'jenny_daily_news_shortcode');

function jenny_register_meta_fields()
{
    if (function_exists('register_post_meta')) {
        register_post_meta('post', 'news_category', array('show_in_rest' => true, 'single' => true, 'type' => 'string'));
        register_post_meta('post', 'is_top_news', array('show_in_rest' => true, 'single' => true, 'type' => 'string'));
        register_post_meta('post', 'news_source', array('show_in_rest' => true, 'single' => true, 'type' => 'string'));
        register_post_meta('post', 'news_original_url', array('show_in_rest' => true, 'single' => true, 'type' => 'string'));
    }
}
add_action('init', 'jenny_register_meta_fields');

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
        .jenny-date-filter { margin-bottom: 24px; padding: 16px 0; border-bottom: 1px solid #e5e7eb; }
        .jenny-info-bar { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
        .jenny-info-card { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
        .jenny-card-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
        .jenny-card-icon { font-size: 16px; }
        .jenny-card-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .jenny-card-chips { display: flex; gap: 8px; flex-wrap: wrap; }
        .jenny-weather-chip, .jenny-fx-chip { display: flex; align-items: center; gap: 4px; background: #ffffff; padding: 6px 10px; border-radius: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb; }
        .jenny-chip-city { font-size: 12px; font-weight: 600; color: #374151; }
        .jenny-chip-temp, .jenny-fx-value { font-size: 13px; font-weight: 700; color: #ea580c; }
        .jenny-fx-flag { font-size: 14px; }
        .jenny-fx-label { font-size: 11px; color: #6b7280; font-weight: 500; }
        .jenny-fx-value { color: #059669; }
        .jenny-card-source { font-size: 9px; color: #9ca3af; font-weight: 400; margin-left: 4px; }
        .jenny-filter-buttons { display: flex; gap: 12px; align-items: center; margin-left: auto; }
        @media (max-width: 900px) { .jenny-info-bar { flex-direction: column; align-items: flex-start; } .jenny-filter-buttons { margin-left: 0; margin-top: 12px; } }
        .jenny-filter-btn { display: inline-block; padding: 10px 20px; background: #f3f4f6; color: #374151; text-decoration: none; border: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; cursor: pointer; }
        .jenny-filter-btn:hover { background: #e5e7eb; color: #111827; }
        .jenny-filter-btn.active { background: #ea580c; color: #ffffff; border-color: #ea580c; }
        .jenny-archive-wrapper { position: relative; }
        .jenny-date-dropdown { display: none; position: absolute; top: 100%; left: 0; background: #ffffff; border: 1px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; min-width: 180px; max-height: 300px; overflow-y: auto; }
        .jenny-archive-wrapper:hover .jenny-date-dropdown { display: block; }
        .jenny-date-option { display: block; padding: 10px 16px; color: #374151; text-decoration: none; font-size: 14px; border-bottom: 1px solid #f3f4f6; }
        .jenny-date-option:hover { background: #f3f4f6; }
        .jenny-date-option.selected { background: #fef3c7; color: #ea580c; font-weight: 600; }
        .jenny-filter-info { margin-top: 12px; padding: 10px 16px; background: #fef3c7; color: #92400e; font-size: 14px; border-left: 3px solid #ea580c; }
        .jenny-filter-info a { color: #ea580c; font-weight: 600; }
        
        /* SECTION TITLES - 섹션 제목은 항상 흰색 */
        .jenny-section-title {
            font-size: 20px;
            font-weight: 800;
            color: #ffffff !important; /* 흰색으로 확실하게 고정 */
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
            .jenny-top-news-row,
            .jenny-top-news-container {
                grid-template-columns: 1fr !important;
            }
            .jenny-news-grid { grid-template-columns: 1fr; }
        }

        /* FLAT CARD STYLE - REMOVED BORDERS/SHADOWS */
        .jenny-news-card {
            background: #ffffff !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            display: flex;
            flex-direction: column;
            overflow: visible !important; /* Allow overflow if needed */
        }
        .jenny-news-card:hover {
            transform: none !important;
            box-shadow: none !important;
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

        /* CONTENT */
        .jenny-content { 
            padding: 0; /* No padding needed without border */
            flex-grow: 1; 
            display: flex; 
            flex-direction: column; 
            text-align: left; 
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
            color: #6b7280;
            margin-bottom: 10px;
            font-weight: 500;
        }
        .jenny-separator {
            margin: 0 6px;
            color: #d1d5db;
            font-size: 10px;
        }
        .jenny-source { color: #1f2937; font-weight: 700; }
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
            color: #4b5563 !important;
            line-height: 1.6;
            margin-bottom: 12px;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        /* 일반 뉴스 그리드의 요약은 더 작게 */
        .jenny-news-grid .jenny-excerpt {
            font-size: 13px !important;
            -webkit-line-clamp: 2 !important; /* 일반 뉴스는 2줄로 제한 */
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
        }
        .jenny-link-text {
            font-size: 13px;
            font-weight: 700;
            color: #111827;
            border-bottom: 2px solid #ea580c;
            padding-bottom: 2px;
        }
        .jenny-link:hover .jenny-link-text {
            background: #ea580c;
            color: #ffffff;
        }

        /* DARK MODE SUPPORT - prefers-color-scheme와 클래스 기반 모두 지원 */
        @media (prefers-color-scheme: dark),
        html[data-theme="dark"],
        html.dark-mode,
        body.dark-mode,
        .dark-mode {
            /* Badge - 다크 모드에서 배지가 보이도록 흰 배경으로 변경 */
            .jenny-badge {
                background: #ffffff !important;
                color: #000000 !important;
                border: 1px solid #e5e7eb !important;
            }

            /* Section Title과 Card Title은 다크모드 스타일 제거 - 항상 고정 색상 사용 */

            /* Meta Line - 다크 모드에서 메타 정보가 보이도록 */
            .jenny-meta-line {
                color: #9ca3af !important;
            }
            .jenny-source {
                color: #e5e7eb !important;
            }
            .jenny-separator {
                color: #6b7280 !important;
            }

            /* Excerpt - 다크 모드에서 요약이 보이도록 */
            .jenny-excerpt {
                color: #d1d5db !important;
            }

            /* Card Background - 다크 모드에서 카드 배경 */
            .jenny-news-card {
                background: #1f2937 !important;
            }

            /* Read More Link - 다크 모드에서 링크가 보이도록 */
            .jenny-link-text {
                color: #e5e7eb !important;
            }
        }
    </style>';
}
