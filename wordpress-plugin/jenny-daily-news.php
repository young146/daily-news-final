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
    
    // 오늘 뉴스가 없고 사용자가 날짜를 선택하지 않았을 때, 전날 뉴스 자동 표시 (최대 7일 전까지)
    $actual_filter_date = $filter_date;
    $is_fallback = false;
    if (!$is_filtered && !$query->have_posts()) {
        // 오늘 뉴스가 없으면 어제부터 최근 7일 전까지 순차적으로 조회
        for ($days_back = 1; $days_back <= 7; $days_back++) {
            $fallback_date = date('Y-m-d', strtotime("-$days_back days", strtotime($today)));
            $fallback_args = array(
                'post_type' => 'post',
                'posts_per_page' => -1,
                'cat' => intval($atts['category']),
                'post_status' => 'publish',
                'orderby' => 'date',
                'order' => 'DESC',
                'date_query' => array(
                    array(
                        'year' => intval(date('Y', strtotime($fallback_date))),
                        'month' => intval(date('m', strtotime($fallback_date))),
                        'day' => intval(date('d', strtotime($fallback_date))),
                    ),
                ),
            );
            
            $fallback_query = new WP_Query($fallback_args);
            if ($fallback_query->have_posts()) {
                // 전날 뉴스를 찾았으면 해당 쿼리 사용
                wp_reset_postdata();
                $query = $fallback_query;
                $actual_filter_date = $fallback_date;
                $is_fallback = true;
                break;
            }
            wp_reset_postdata();
        }
    }

    // 카테고리 순서 정의 (sections와 일치하도록 모든 변형 포함)
    $category_order = array(
        // Society
        '사회' => 1,
        'Society' => 1,
        // Economy
        '경제' => 2,
        'Economy' => 2,
        // Culture
        '문화' => 3,
        'Culture' => 3,
        // Politics (Policy 포함, 정책 포함)
        '정치' => 4,
        '정책' => 4,
        'Politics' => 4,
        'Policy' => 4, // Backward compat with Policy
        // International
        '국제' => 5,
        'International' => 5,
        // Korea-Vietnam (모든 변형 포함)
        '한베' => 6,
        '한-베' => 6,
        'Korea-Vietnam' => 6,
        // Community (모든 변형 포함)
        '교민' => 7,
        '교민소식' => 7,
        'Community' => 7,
        // Travel
        '여행' => 8,
        'Travel' => 8,
        // Health
        '건강' => 9,
        'Health' => 9,
        // Food
        '음식' => 10,
        'Food' => 10,
    );

    // 뉴스를 카테고리별로 정렬하고 Top News 분리
    $sorted_posts = array();
    $top_news_posts = array();
    $regular_posts = array();

    // 오늘 뉴스 (현재 쿼리 결과)
    $today_posts = array();
    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $post_id = get_the_ID();

            // 카테고리 확인 - news_category 메타 필드 우선 확인
            $news_category = get_post_meta($post_id, 'news_category', true);
            
            // 메타 필드가 비어있거나 잘못된 경우 WordPress 카테고리에서 가져오기
            if (empty($news_category) || trim($news_category) === '') {
                $categories = get_the_category($post_id);
                $news_category = !empty($categories) ? $categories[0]->name : '뉴스';
            }
            
            // 카테고리 값 정규화 (공백 제거, 대소문자 통일)
            $news_category = trim($news_category);
            
            // 디버깅: 카테고리 값 로깅 (개발 환경에서만)
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log("Jenny Plugin - Post ID: $post_id, Category: $news_category");
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

            $today_posts[] = $item;
        }
        wp_reset_postdata();
    }

    // 오늘 뉴스가 있고 날짜 필터가 없는 경우 (오늘 뉴스 표시 모드), 전날 뉴스로 보완
    // 날짜 필터가 있는 경우(지난 뉴스 보기)에는 이 로직을 적용하지 않음
    $past_posts = array();
    if (!$is_filtered && !$is_fallback && !empty($today_posts)) {
        // 전날 뉴스 가져오기 (오늘 날짜가 아닌 모든 이전 뉴스)
        $past_args = array(
            'post_type' => 'post',
            'posts_per_page' => -1,
            'cat' => intval($atts['category']),
            'post_status' => 'publish',
            'orderby' => 'date',
            'order' => 'DESC',
            'date_query' => array(
                array(
                    'before' => $today,
                    'inclusive' => false,
                ),
            ),
        );
        $past_query = new WP_Query($past_args);
        
        if ($past_query->have_posts()) {
            while ($past_query->have_posts()) {
                $past_query->the_post();
                $post_id = get_the_ID();

                // 카테고리 확인
                $news_category = get_post_meta($post_id, 'news_category', true);
                if (empty($news_category) || trim($news_category) === '') {
                    $categories = get_the_category($post_id);
                    $news_category = !empty($categories) ? $categories[0]->name : '뉴스';
                }
                $news_category = trim($news_category);

                // Top News는 제외 (오늘 뉴스의 탑뉴스만 사용)
                $is_top_raw = get_post_meta($post_id, 'is_top_news', true);
                $is_top = ($is_top_raw === '1' || $is_top_raw === 1 || $is_top_raw === true || $is_top_raw === 'true');
                
                if ($is_top) {
                    continue; // 전날 탑뉴스는 제외
                }

                $order = isset($category_order[$news_category]) ? $category_order[$news_category] : 99;

                $item = array(
                    'post_id' => $post_id,
                    'order' => $order,
                    'date' => get_the_date('Y-m-d H:i:s'),
                    'category' => $news_category,
                    'is_top' => false
                );

                $past_posts[] = $item;
            }
            wp_reset_postdata();
        }
    }

    // 섹션 정의 (나중에 사용)
    $sections_keys = array(
        'economy' => array('Economy', '경제'),
        'society' => array('Society', '사회'),
        'culture' => array('Culture', '문화'),
        'politics' => array('Politics', 'Policy', '정치', '정책'),
        'international' => array('International', '국제'),
        'korea_vietnam' => array('Korea-Vietnam', '한-베', '한베'),
        'community' => array('Community', '교민', '교민소식'),
        'travel' => array('Travel', '여행'),
        'health' => array('Health', '건강'),
        'food' => array('Food', '음식'),
    );

    // 카테고리를 섹션 키로 변환하는 함수
    $get_section_key = function($category) use ($sections_keys) {
        $cat = trim($category);
        foreach ($sections_keys as $sec_key => $keys) {
            if (in_array($cat, $keys, true)) {
                return $sec_key;
            }
            foreach ($keys as $key) {
                if (strcasecmp($cat, $key) === 0) {
                    return $sec_key;
                }
            }
        }
        return 'other';
    };

    // 날짜 필터가 있는 경우(지난 뉴스 보기)에는 기존 로직 사용
    // 날짜 필터가 없고 오늘 뉴스가 있는 경우에만 최소 10개 유지 로직 적용
    if ($is_filtered || $is_fallback) {
        // 날짜 필터가 있거나 fallback인 경우 기존 로직 사용
        foreach ($today_posts as $post) {
            if ($post['is_top']) {
                $top_news_posts[] = $post;
            } else {
                $regular_posts[] = $post;
            }
        }
    } else {
        // 오늘 뉴스 표시 모드: 각 섹션별로 최소 10개 유지
        // 오늘 뉴스를 섹션별로 그룹화
        $today_by_section = array();
        foreach ($today_posts as $post) {
            $sec_key = $get_section_key($post['category']);
            if (!isset($today_by_section[$sec_key])) {
                $today_by_section[$sec_key] = array();
            }
            $today_by_section[$sec_key][] = $post;
        }

        // 전날 뉴스를 섹션별로 그룹화
        $past_by_section = array();
        foreach ($past_posts as $post) {
            $sec_key = $get_section_key($post['category']);
            if (!isset($past_by_section[$sec_key])) {
                $past_by_section[$sec_key] = array();
            }
            $past_by_section[$sec_key][] = $post;
        }

        // 각 섹션별로 최소 10개 유지하도록 보완
        $min_posts_per_section = 10;
        $final_posts = array();
        
        foreach ($today_posts as $post) {
            if ($post['is_top']) {
                $top_news_posts[] = $post;
            } else {
                $sec_key = $get_section_key($post['category']);
                if (!isset($final_posts[$sec_key])) {
                    $final_posts[$sec_key] = array();
                }
                $final_posts[$sec_key][] = $post;
            }
        }

        // 각 섹션별로 부족한 만큼 전날 뉴스로 채우기
        foreach ($sections_keys as $sec_key => $keys) {
            $today_count = isset($final_posts[$sec_key]) ? count($final_posts[$sec_key]) : 0;
            
            if ($today_count < $min_posts_per_section && isset($past_by_section[$sec_key])) {
                $needed = $min_posts_per_section - $today_count;
                $past_section_posts = $past_by_section[$sec_key];
                
                // 날짜순 정렬 (최신순)
                usort($past_section_posts, function($a, $b) {
                    return strcmp($b['date'], $a['date']);
                });
                
                // 필요한 만큼만 추가
                $added = 0;
                foreach ($past_section_posts as $past_post) {
                    if ($added >= $needed) break;
                    
                    // 이미 추가된 뉴스인지 확인 (중복 방지)
                    $already_added = false;
                    if (isset($final_posts[$sec_key])) {
                        foreach ($final_posts[$sec_key] as $existing) {
                            if ($existing['post_id'] === $past_post['post_id']) {
                                $already_added = true;
                                break;
                            }
                        }
                    }
                    
                    if (!$already_added) {
                        if (!isset($final_posts[$sec_key])) {
                            $final_posts[$sec_key] = array();
                        }
                        $final_posts[$sec_key][] = $past_post;
                        $added++;
                    }
                }
            }
        }

        // final_posts를 regular_posts로 변환
        foreach ($final_posts as $sec_posts) {
            foreach ($sec_posts as $post) {
                $regular_posts[] = $post;
            }
        }
    }

    // 정렬 함수
    $sort_func = function ($a, $b) {
        if ($a['order'] === $b['order']) {
            return strcmp($b['date'], $a['date']);
        }
        return $a['order'] - $b['order'];
    };

    usort($top_news_posts, $sort_func);
    usort($regular_posts, $sort_func);

    // 가능한 많은 날짜 가져오기 (오늘 날짜 제외)
    $date_args = array(
        'post_type' => 'post',
        'posts_per_page' => -1, // 모든 게시물 가져오기
        'cat' => intval($atts['category']),
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
        'date_query' => array(
            array(
                'before' => $today, // 오늘 이전 날짜만
                'inclusive' => false,
            ),
        ),
    );
    $date_query = new WP_Query($date_args);
    $available_dates = array();
    while ($date_query->have_posts()) {
        $date_query->the_post();
        $post_date = get_the_date('Y-m-d');
        // 오늘 날짜는 제외
        if ($post_date !== $today && !in_array($post_date, $available_dates)) {
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

    // 인라인 확장 방식으로 변경
    $output .= '<div class="jenny-archive-wrapper">';
    $output .= '<button type="button" class="jenny-filter-btn jenny-archive-btn' . ($is_filtered ? ' active' : '') . '" aria-expanded="false">';
    $output .= '지난 뉴스 보기 <span class="jenny-arrow">▼</span>';
    $output .= '</button>';
    $output .= '<div class="jenny-date-list">'; // 인라인으로 펼쳐지는 리스트
    if (!empty($available_dates)) {
        foreach ($available_dates as $date) {
            $date_obj = new DateTime($date);
            $date_display = $date_obj->format('Y') . '년 ' . $date_obj->format('m') . '월 ' . $date_obj->format('d') . '일';
            $date_class = ($selected_date === $date) ? ' selected' : '';
            $output .= '<a href="' . esc_url(add_query_arg('news_date', $date, $page_url)) . '" class="jenny-date-option' . $date_class . '">' . esc_html($date_display) . '</a>';
        }
    } else {
        $output .= '<div class="jenny-date-option jenny-no-dates">지난 뉴스가 없습니다.</div>';
    }
    $output .= '</div></div></div>'; // Close filter-buttons
    
    // 섹션 네비게이션 메뉴 추가
    $output .= '<div class="jenny-section-nav">';
    $output .= '<div class="jenny-section-nav-header">';
    $output .= '<span class="jenny-section-nav-icon">📍</span>';
    $output .= '<span class="jenny-section-nav-title">뉴스 섹션 바로가기</span>';
    $output .= '</div>';
    $output .= '<div class="jenny-section-nav-list">';
    
    // 섹션 네비게이션 항목 (탑뉴스 제외)
    $section_nav_items = array(
        'economy' => array('label' => '경제', 'icon' => '📈'),
        'society' => array('label' => '사회', 'icon' => '👥'),
        'culture' => array('label' => '문화/스포츠', 'icon' => '🎭'),
        'politics' => array('label' => '정치/정책', 'icon' => '⚖️'),
        'international' => array('label' => '국제', 'icon' => '🌏'),
        'korea_vietnam' => array('label' => '한-베', 'icon' => '🇰🇷🇻🇳'),
        'community' => array('label' => '교민소식', 'icon' => '📢'),
        'travel' => array('label' => '여행', 'icon' => '✈️'),
        'health' => array('label' => '건강', 'icon' => '🏥'),
        'food' => array('label' => '음식', 'icon' => '🍽️'),
    );
    
    foreach ($section_nav_items as $sec_key => $nav_info) {
        $output .= '<a href="#jenny-section-' . esc_attr($sec_key) . '" class="jenny-section-nav-item" data-section="' . esc_attr($sec_key) . '">';
        $output .= '<span class="jenny-nav-icon">' . esc_html($nav_info['icon']) . '</span>';
        $output .= '<span class="jenny-nav-label">' . esc_html($nav_info['label']) . '</span>';
        $output .= '</a>';
    }
    
    $output .= '</div>'; // Close jenny-section-nav-list
    $output .= '</div>'; // Close jenny-section-nav
    $output .= '</div>'; // Close jenny-info-bar
    $output .= '</div>'; // Close jenny-date-filter

    if ($is_filtered) {
        $sel_date_obj = new DateTime($selected_date);
        $display_date = $sel_date_obj->format('Y') . '년 ' . $sel_date_obj->format('m') . '월 ' . $sel_date_obj->format('d') . '일';
        $output .= '<div class="jenny-filter-info">' . esc_html($display_date) . ' 뉴스를 보고 있습니다. <a href="' . esc_url($page_url) . '">오늘의 뉴스로 돌아가기</a></div>';
    } elseif ($is_fallback) {
        // 오늘 뉴스가 없어서 전날 뉴스를 표시하는 경우
        $fallback_date_obj = new DateTime($actual_filter_date);
        $fallback_display_date = $fallback_date_obj->format('Y') . '년 ' . $fallback_date_obj->format('m') . '월 ' . $fallback_date_obj->format('d') . '일';
        $output .= '<div class="jenny-filter-info" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">';
        $output .= '<strong>📅 ' . esc_html($fallback_display_date) . ' 뉴스를 표시하고 있습니다.</strong><br>';
        $output .= '<small style="color: #92400e;">오늘의 뉴스가 아직 게시되지 않아 최근 뉴스를 보여드립니다. 오늘의 뉴스가 게시되면 자동으로 업데이트됩니다.</small>';
        $output .= '</div>';
    }

    $output .= '</div>'; // Close jenny-date-filter

    if (empty($top_news_posts) && empty($regular_posts)) {
        $output .= '<p style="text-align:center; padding: 40px 20px; color: #6b7280;">선택한 날짜에 등록된 뉴스가 없습니다.</p>';
        $output .= jenny_get_styles();
        return $output;
    }

    // 카테고리 표시 이름 매핑 (모든 가능한 입력값에 대해 한글 표시명 제공)
    $category_map = array(
        // Society
        'Society' => '사회',
        '사회' => '사회',
        // Economy
        'Economy' => '경제',
        '경제' => '경제',
        // Culture
        'Culture' => '문화/스포츠',
        '문화' => '문화/스포츠',
        // Politics
        'Politics' => '정치/정책',
        'Policy' => '정치/정책',
        '정치' => '정치/정책',
        '정책' => '정치/정책',
        // International
        'International' => '국제',
        '국제' => '국제',
        // Korea-Vietnam
        'Korea-Vietnam' => '한-베',
        '한-베' => '한-베',
        '한베' => '한-베',
        // Community
        'Community' => '교민소식',
        '교민' => '교민소식',
        '교민소식' => '교민소식',
        // Travel
        'Travel' => '여행',
        '여행' => '여행',
        // Health
        'Health' => '건강',
        '건강' => '건강',
        // Food
        'Food' => '음식',
        '음식' => '음식',
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

        $news_category = trim($post_data['category']);
        if (!empty($news_category)) {
            // 정확한 매칭 시도
            if (isset($category_map[$news_category])) {
                $cat_name = $category_map[$news_category];
            } else {
                // 대소문자 무시 매칭 시도
                $cat_name = $news_category; // 기본값
                foreach ($category_map as $key => $value) {
                    if (strcasecmp($news_category, $key) === 0) {
                        $cat_name = $value;
                        break;
                    }
                }
            }
        } else {
            $cat_name = '뉴스';
        }

        // 본문에서 출처/날짜/원문 정보를 먼저 제거한 후 excerpt 생성
        $content = strip_tags($post_obj->post_content);
        
        // 본문에서 출처/날짜/원문 정보 제거 (Jenny 페이지용 - 메타 라인과 중복 방지)
        // 패턴 1: "출처: [소스명] 날짜: [날짜]" 형식 (공백 포함 소스명 지원)
        // "출처: " 다음에 여러 단어(공백 포함), 그 다음 "날짜: " 다음에 날짜 패턴(점 포함)까지 제거
        $content = preg_replace('/출처\s*:\s*[^날]+날짜\s*:\s*[0-9.\s]+\.{0,2}\s*/i', '', $content);
        // 패턴 2: "출처: [소스명] | 날짜: [날짜] |" 형식
        $content = preg_replace('/출처\s*:\s*[^|]*\s*\|/i', '', $content);
        $content = preg_replace('/날짜\s*:\s*[^|]*\s*\|/i', '', $content);
        // 패턴 3: "원문 기사 전체 보기" 또는 "원문 보기" 링크 제거 (점 전까지)
        $content = preg_replace('/원문\s*(기사\s*)?(전체\s*)?보기[^가-힣a-zA-Z0-9]*/i', '', $content);
        // 패턴 4: 남은 구분선 제거
        $content = preg_replace('/\s*[|]\s*/', ' ', $content);
        // 패턴 5: 연속된 공백 정리
        $content = preg_replace('/\s{2,}/', ' ', $content);
        $content = trim($content);
        
        // 정제된 본문에서 excerpt 생성 (첫 문장부터 시작)
        if (!empty($content)) {
            $excerpt = wp_trim_words($content, 50, '...');
        } else {
            // 본문이 비어있으면 WordPress excerpt 사용
            $excerpt = get_the_excerpt($post_data['post_id']);
            if (empty($excerpt)) {
                $excerpt = '';
            }
        }
        
        // excerpt에서도 한 번 더 정제 (안전장치)
        if (!empty($excerpt)) {
            $excerpt = preg_replace('/출처\s*:\s*[^날]+날짜\s*:\s*[0-9.\s]+\.{0,2}\s*/i', '', $excerpt);
            $excerpt = preg_replace('/출처\s*:\s*[^|]*\s*\|/i', '', $excerpt);
            $excerpt = preg_replace('/날짜\s*:\s*[^|]*\s*\|/i', '', $excerpt);
            $excerpt = preg_replace('/원문\s*(기사\s*)?(전체\s*)?보기[^가-힣a-zA-Z0-9]*/i', '', $excerpt);
            $excerpt = preg_replace('/\s*[|]\s*/', ' ', $excerpt);
            $excerpt = preg_replace('/\s{2,}/', ' ', $excerpt);
            $excerpt = trim($excerpt);
        }

        // WordPress 본문 링크 (모든 카드 요소는 이 링크 사용)
        $permalink = get_permalink($post_data['post_id']);
        // 원문 링크는 메타 라인의 "원문 보기"에만 사용
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
        // 이미지 링크는 항상 WordPress 본문으로 연결
        $html .= '<a href="' . esc_url($permalink) . '">';
        $html .= '<img src="' . esc_url($thumb_url) . '" alt="' . esc_attr(get_the_title($post_data['post_id'])) . '" loading="lazy">';
        $html .= '</a>';
        // Badge removed for flat design preference? Or kept? User asked for "flat". Let's keep badge but simple.
        $html .= '<span class="jenny-badge">' . esc_html($cat_name) . '</span>';
        $html .= '</div>';

        $html .= '<div class="jenny-content">';
        // 제목 링크는 항상 WordPress 본문으로 연결
        $html .= '<h3 class="jenny-title"><a href="' . esc_url($permalink) . '">' . get_the_title($post_data['post_id']) . '</a></h3>';
        $html .= $meta_line; // Insert Meta Line below title
        // excerpt가 있을 때만 표시
        if (!empty($excerpt)) {
            $html .= '<div class="jenny-excerpt">' . esc_html($excerpt) . '</div>';
        }
        // "자세히 보기"는 WP 본문으로 이동
        $html .= '<a href="' . esc_url($permalink) . '" class="jenny-link"><span class="jenny-link-text">자세히 보기</span></a>';
        $html .= '</div>';
        $html .= '</div>';

        return $html;
    }

    // Define Sections and their Category Keys
    // Keys match the 'news_category' or mapped name
    $sections = array(
        'economy' => array('title' => '📈 경제 (Economy)', 'keys' => array('Economy', '경제')),
        'society' => array('title' => '👥 사회 (Society)', 'keys' => array('Society', '사회')),
        'culture' => array('title' => '🎭 문화/스포츠 (Culture)', 'keys' => array('Culture', '문화')),
        'politics' => array('title' => '⚖️ 정치/정책 (Politics)', 'keys' => array('Politics', 'Policy', '정치', '정책')),
        'international' => array('title' => '🌏 국제 (International)', 'keys' => array('International', '국제')),
        'korea_vietnam' => array('title' => '🇰🇷🇻🇳 한-베 관계 (Korea-Vietnam)', 'keys' => array('Korea-Vietnam', '한-베', '한베')),
        'community' => array('title' => '📢 교민 소식 (Community)', 'keys' => array('Community', '교민', '교민소식')),
        'travel' => array('title' => '✈️ 여행 (Travel)', 'keys' => array('Travel', '여행')),
        'health' => array('title' => '🏥 건강 (Health)', 'keys' => array('Health', '건강')),
        'food' => array('title' => '🍽️ 음식 (Food)', 'keys' => array('Food', '음식')),
        'other' => array('title' => '✨ 기타 뉴스', 'keys' => array()) // Fallback
    );

    // Bucket posts into sections
    $grouped_posts = array();
    
    // 날짜 필터가 있거나 fallback인 경우 regular_posts를 섹션별로 그룹화
    if ($is_filtered || $is_fallback) {
        foreach ($regular_posts as $post) {
            $cat = trim($post['category']);
            $found = false;

            // Find which section this post belongs to
            foreach ($sections as $sec_key => $sec_info) {
                if ($sec_key === 'other')
                    continue;

                // 정확한 매칭 시도
                if (in_array($cat, $sec_info['keys'], true)) {
                    if (!isset($grouped_posts[$sec_key])) {
                        $grouped_posts[$sec_key] = array();
                    }
                    $grouped_posts[$sec_key][] = $post;
                    $found = true;
                    break;
                }
                
                // 대소문자 무시 매칭
                foreach ($sec_info['keys'] as $key) {
                    if (strcasecmp($cat, $key) === 0) {
                        if (!isset($grouped_posts[$sec_key])) {
                            $grouped_posts[$sec_key] = array();
                        }
                        $grouped_posts[$sec_key][] = $post;
                        $found = true;
                        break 2;
                    }
                }
            }

            // 매칭 실패 시 기타로 분류
            if (!$found) {
                if (!isset($grouped_posts['other'])) {
                    $grouped_posts['other'] = array();
                }
                $grouped_posts['other'][] = $post;
            }
        }
    } else {
        // 오늘 뉴스 표시 모드: 이미 $final_posts에 섹션별로 그룹화되어 있음
        $grouped_posts = isset($final_posts) ? $final_posts : array();
        
        // regular_posts에 있지만 섹션에 매칭되지 않은 항목들을 'other'로 추가
        foreach ($regular_posts as $post) {
            $cat = trim($post['category']);
            $found = false;
            
            // 이미 그룹화된 항목인지 확인
            foreach ($grouped_posts as $sec_key => $sec_posts) {
                foreach ($sec_posts as $existing) {
                    if ($existing['post_id'] === $post['post_id']) {
                        $found = true;
                        break 2;
                    }
                }
            }
            
            // 매칭되지 않은 항목은 'other'로 분류
            if (!$found) {
                if (!isset($grouped_posts['other'])) {
                    $grouped_posts['other'] = array();
                }
                $grouped_posts['other'][] = $post;
            }
        }
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
                // If extra top news, add to regular posts in the correct section
                $sec_key = $get_section_key($post['category']);
                if (!isset($grouped_posts[$sec_key])) {
                    $grouped_posts[$sec_key] = array();
                }
                $grouped_posts[$sec_key][] = $post;
                continue;
            }
            $output .= render_jenny_card($post, $category_map);
            $top_count++;
        }
        $output .= '</div>'; // Close jenny-top-news-row

        // Ad Slot after Top News
        $output .= '<div class="jenny-ad-section"><div class="jenny-ad-placeholder"><span>Google Ads / Banner Area (Top News)</span></div></div>';
    }

    // --- 2. Render Sections ---
    foreach ($sections as $sec_key => $sec_info) {
        if (!empty($grouped_posts[$sec_key])) {
            // Sort
            usort($grouped_posts[$sec_key], $sort_func);

            $output .= '<h2 id="jenny-section-' . esc_attr($sec_key) . '" class="jenny-section-title">' . esc_html($sec_info['title']) . '</h2>';
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
    $output .= jenny_get_scripts();

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

function jenny_get_scripts()
{
    return '<script>
    (function() {
        // 아코디언 토글 기능 (모바일 + PC 모두)
        document.addEventListener("DOMContentLoaded", function() {
            var archiveWrappers = document.querySelectorAll(".jenny-archive-wrapper");
            archiveWrappers.forEach(function(wrapper) {
                var btn = wrapper.querySelector(".jenny-archive-btn");
                var dateList = wrapper.querySelector(".jenny-date-list");
                
                if (!btn || !dateList) return;
                
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
                });
                
                // 아코디언 외부 클릭 시 닫기
                document.addEventListener("click", function(e) {
                    if (!wrapper.contains(e.target)) {
                        wrapper.classList.remove("active");
                        btn.setAttribute("aria-expanded", "false");
                    }
                });
                
                // 날짜 옵션 클릭 시 리스트 닫기
                var dateOptions = dateList.querySelectorAll(".jenny-date-option");
                dateOptions.forEach(function(option) {
                    option.addEventListener("click", function() {
                        wrapper.classList.remove("active");
                        btn.setAttribute("aria-expanded", "false");
                    });
                });
            });
            
            // 섹션 네비게이션 스크롤 기능
            var sectionNavItems = document.querySelectorAll(".jenny-section-nav-item");
            sectionNavItems.forEach(function(item) {
                item.addEventListener("click", function(e) {
                    e.preventDefault();
                    var targetId = this.getAttribute("href");
                    var targetElement = document.querySelector(targetId);
                    
                    if (targetElement) {
                        // 부드러운 스크롤
                        var headerOffset = 80; // 상단 고정 요소 높이 고려
                        var elementPosition = targetElement.getBoundingClientRect().top;
                        var offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                        
                        window.scrollTo({
                            top: offsetPosition,
                            behavior: "smooth"
                        });
                        
                        // 활성 상태 표시 (선택사항)
                        sectionNavItems.forEach(function(nav) {
                            nav.classList.remove("active");
                        });
                        this.classList.add("active");
                        
                        // 1초 후 활성 상태 제거
                        setTimeout(function() {
                            item.classList.remove("active");
                        }, 1000);
                    }
                });
            });
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
        /* PC에서도 호버로 열기 */
        @media (min-width: 769px) {
            .jenny-archive-wrapper:hover .jenny-date-list { 
                display: block !important; 
            }
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
        .jenny-filter-info { margin-top: 12px; padding: 10px 16px; background: #fef3c7; color: #92400e; font-size: 14px; border-left: 3px solid #ea580c; }
        .jenny-filter-info a { color: #ea580c; font-weight: 600; }
        
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

        /* WordPress 본문 페이지 모바일 표시 보장 */
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
