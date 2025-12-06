<?php
/**
 * Plugin Name: Jenny Daily News Display
 * Description: Displays daily news in a beautiful card layout using the shortcode [daily_news_list]. Shows excerpt and links to full article. Includes weather and exchange rate info.
 * Version: 1.7
 * Author: Jenny (Antigravity)
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function jenny_get_weather_html() {
    $cities = array(
        array( 'name' => '하노이', 'id' => 'hanoi' ),
        array( 'name' => '호치민', 'id' => 'hochiminh' ),
        array( 'name' => '서울', 'id' => 'seoul' ),
    );
    
    $output = '';
    foreach ( $cities as $city ) {
        $shortcode = '[starter_starter_starter id="' . $city['id'] . '"]';
        $weather_output = do_shortcode( $shortcode );
        if ( ! empty( $weather_output ) && $weather_output !== $shortcode ) {
            $output .= '<div class="jenny-city-weather">' . $weather_output . '</div>';
        }
    }
    
    if ( empty( $output ) ) {
        $output = jenny_get_weather_fallback();
    }
    
    return $output;
}

function jenny_get_weather_fallback() {
    $cache_key = 'jenny_weather_html_v4';
    $cached = get_transient( $cache_key );
    if ( $cached !== false && is_string( $cached ) && strpos( $cached, '°C' ) !== false ) {
        return $cached;
    }

    $cities = array(
        array( 'name' => '하노이', 'lat' => 21.0285, 'lon' => 105.8542 ),
        array( 'name' => '호치민', 'lat' => 10.8231, 'lon' => 106.6297 ),
        array( 'name' => '서울', 'lat' => 37.5665, 'lon' => 126.9780 ),
    );

    $output = '';
    foreach ( $cities as $city ) {
        $url = 'https://api.open-meteo.com/v1/forecast?latitude=' . $city['lat'] . '&longitude=' . $city['lon'] . '&current_weather=true';
        $response = wp_remote_get( $url, array( 'timeout' => 10 ) );
        $temp = '--';
        
        if ( ! is_wp_error( $response ) ) {
            $body = json_decode( wp_remote_retrieve_body( $response ), true );
            if ( isset( $body['current_weather']['temperature'] ) ) {
                $temp = round( $body['current_weather']['temperature'] ) . '°C';
            }
        }
        
        $output .= '<div class="jenny-weather-chip">';
        $output .= '<span class="jenny-chip-city">' . esc_html( $city['name'] ) . '</span>';
        $output .= '<span class="jenny-chip-temp">' . esc_html( $temp ) . '</span>';
        $output .= '</div>';
    }

    if ( strpos( $output, '°C' ) !== false ) {
        set_transient( $cache_key, $output, 30 * MINUTE_IN_SECONDS );
    }
    return $output;
}

function jenny_get_exchange_data() {
    $cache_key = 'jenny_exchange_v3';
    $cached = get_transient( $cache_key );
    if ( $cached !== false && is_array( $cached ) && isset( $cached['krw_100'] ) ) {
        return $cached;
    }

    $exchange_data = array(
        'usd' => '25,400',
        'krw_100' => '1,780',
    );

    $url = 'https://open.er-api.com/v6/latest/USD';
    $response = wp_remote_get( $url, array( 
        'timeout' => 10,
        'user-agent' => 'Mozilla/5.0'
    ) );
    
    if ( ! is_wp_error( $response ) ) {
        $body = json_decode( wp_remote_retrieve_body( $response ), true );
        if ( isset( $body['rates'] ) && isset( $body['rates']['VND'] ) ) {
            $vnd_rate = floatval( $body['rates']['VND'] );
            $exchange_data['usd'] = number_format( $vnd_rate, 0 );
            
            if ( isset( $body['rates']['KRW'] ) ) {
                $krw_rate = floatval( $body['rates']['KRW'] );
                if ( $krw_rate > 0 ) {
                    $krw_to_vnd = ( $vnd_rate / $krw_rate ) * 100;
                    $exchange_data['krw_100'] = number_format( $krw_to_vnd, 0 );
                }
            }
        }
    }

    set_transient( $cache_key, $exchange_data, 60 * MINUTE_IN_SECONDS );
    return $exchange_data;
}

function jenny_register_meta_fields() {
    if ( function_exists( 'register_post_meta' ) ) {
        register_post_meta( 'post', 'news_category', array(
            'show_in_rest' => true,
            'single' => true,
            'type' => 'string',
        ));
    }
}
add_action( 'init', 'jenny_register_meta_fields' );

function jenny_daily_news_shortcode( $atts ) {
    $atts = shortcode_atts( array(
        'count' => -1,
        'category' => 31,
    ), $atts );

    $selected_date = '';
    if ( isset( $_GET['news_date'] ) ) {
        $selected_date = sanitize_text_field( $_GET['news_date'] );
    }
    $is_filtered = ( $selected_date !== '' );

    // 오늘 날짜 (WordPress 타임존 기준)
    $today = current_time( 'Y-m-d' );

    $args = array(
        'post_type' => 'post',
        'posts_per_page' => -1,
        'cat' => intval( $atts['category'] ),
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
    );

    // 날짜 필터 적용 (선택된 날짜 또는 오늘)
    $filter_date = $is_filtered ? $selected_date : $today;
    $date_parts = explode( '-', $filter_date );
    if ( count( $date_parts ) === 3 ) {
        $args['date_query'] = array(
            array(
                'year'  => intval( $date_parts[0] ),
                'month' => intval( $date_parts[1] ),
                'day'   => intval( $date_parts[2] ),
            ),
        );
    }

    $query = new WP_Query( $args );

    // 카테고리 순서 정의
    $category_order = array(
        '경제' => 1,
        'Economy' => 1,
        '사회' => 2,
        'Society' => 2,
        '정치' => 3,
        'Policy' => 3,
        '문화' => 4,
        'Culture' => 4,
        '한베' => 5,
        'Korea-Vietnam' => 5,
        '한-베' => 5,
        '교민' => 6,
        '교민 소식' => 6,
        '교민소식' => 6,
    );

    // 뉴스를 카테고리별로 정렬
    $sorted_posts = array();
    if ( $query->have_posts() ) {
        while ( $query->have_posts() ) {
            $query->the_post();
            $post_id = get_the_ID();
            
            // 카테고리 확인 (메타 또는 WordPress 카테고리)
            $news_category = get_post_meta( $post_id, 'news_category', true );
            if ( empty( $news_category ) ) {
                $categories = get_the_category();
                $news_category = ! empty( $categories ) ? $categories[0]->name : '뉴스';
            }
            
            // 순서 결정 (정의되지 않은 카테고리는 맨 뒤)
            $order = isset( $category_order[ $news_category ] ) ? $category_order[ $news_category ] : 99;
            
            $sorted_posts[] = array(
                'post_id' => $post_id,
                'order' => $order,
                'date' => get_the_date( 'Y-m-d H:i:s' ),
            );
        }
        wp_reset_postdata();
        
        // 카테고리 순서로 정렬, 같은 카테고리 내에서는 날짜순
        usort( $sorted_posts, function( $a, $b ) {
            if ( $a['order'] === $b['order'] ) {
                return strcmp( $b['date'], $a['date'] ); // 날짜 내림차순
            }
            return $a['order'] - $b['order']; // 카테고리 순서
        });
    }

    $date_args = array(
        'post_type' => 'post',
        'posts_per_page' => 100,
        'cat' => intval( $atts['category'] ),
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
    );
    $date_query = new WP_Query( $date_args );
    $available_dates = array();
    while ( $date_query->have_posts() ) {
        $date_query->the_post();
        $post_date = get_the_date( 'Y-m-d' );
        if ( ! in_array( $post_date, $available_dates ) ) {
            $available_dates[] = $post_date;
        }
    }
    wp_reset_postdata();

    $page_url = get_permalink();
    
    $exchange = jenny_get_exchange_data();
    
    $output = '<div class="jenny-date-filter">';
    
    $output .= '<div class="jenny-info-bar">';
    
    $output .= '<div class="jenny-info-card jenny-weather-card">';
    $output .= '<div class="jenny-card-header">';
    $output .= '<span class="jenny-card-icon">🌤</span>';
    $output .= '<span class="jenny-card-title">오늘의 날씨</span>';
    $output .= '<span class="jenny-card-source">(Open-Meteo)</span>';
    $output .= '</div>';
    $output .= '<div class="jenny-card-chips">';
    $output .= jenny_get_weather_fallback();
    $output .= '</div>';
    $output .= '</div>';
    
    $output .= '<div class="jenny-info-card jenny-fx-card">';
    $output .= '<div class="jenny-card-header">';
    $output .= '<span class="jenny-card-icon">💱</span>';
    $output .= '<span class="jenny-card-title">환율</span>';
    $output .= '<span class="jenny-card-source">(유럽중앙은행 ECB 기준)</span>';
    $output .= '</div>';
    $output .= '<div class="jenny-card-chips">';
    $output .= '<div class="jenny-fx-chip">';
    $output .= '<span class="jenny-fx-flag">🇺🇸</span>';
    $output .= '<span class="jenny-fx-label">1 USD</span>';
    $output .= '<span class="jenny-fx-value">' . esc_html( $exchange['usd'] ) . '₫</span>';
    $output .= '</div>';
    $output .= '<div class="jenny-fx-chip">';
    $output .= '<span class="jenny-fx-flag">🇰🇷</span>';
    $output .= '<span class="jenny-fx-label">100 KRW</span>';
    $output .= '<span class="jenny-fx-value">' . esc_html( $exchange['krw_100'] ) . '₫</span>';
    $output .= '</div>';
    $output .= '</div>';
    $output .= '</div>';
    
    $output .= '<div class="jenny-filter-buttons">';
    if ( $is_filtered ) {
        $output .= '<a href="' . esc_url( $page_url ) . '" class="jenny-filter-btn">오늘의 뉴스</a>';
    } else {
        $output .= '<span class="jenny-filter-btn active">오늘의 뉴스</span>';
    }
    
    $output .= '<div class="jenny-archive-wrapper">';
    if ( $is_filtered ) {
        $output .= '<span class="jenny-filter-btn jenny-archive-btn active">지난 뉴스 보기 ▼</span>';
    } else {
        $output .= '<span class="jenny-filter-btn jenny-archive-btn">지난 뉴스 보기 ▼</span>';
    }
    $output .= '<div class="jenny-date-dropdown">';
    
    foreach ( $available_dates as $date ) {
        $date_obj = new DateTime( $date );
        $date_display = $date_obj->format( 'Y' ) . '년 ' . $date_obj->format( 'm' ) . '월 ' . $date_obj->format( 'd' ) . '일';
        $date_class = ( $selected_date === $date ) ? ' selected' : '';
        $output .= '<a href="' . esc_url( add_query_arg( 'news_date', $date, $page_url ) ) . '" class="jenny-date-option' . $date_class . '">' . esc_html( $date_display ) . '</a>';
    }
    
    $output .= '</div>';
    $output .= '</div>';
    $output .= '</div>';
    $output .= '</div>';
    
    if ( $is_filtered ) {
        $sel_date_obj = new DateTime( $selected_date );
        $display_date = $sel_date_obj->format( 'Y' ) . '년 ' . $sel_date_obj->format( 'm' ) . '월 ' . $sel_date_obj->format( 'd' ) . '일';
        $output .= '<div class="jenny-filter-info">' . esc_html( $display_date ) . ' 뉴스를 보고 있습니다. <a href="' . esc_url( $page_url ) . '">오늘의 뉴스로 돌아가기</a></div>';
    }
    
    $output .= '</div>';

    if ( empty( $sorted_posts ) ) {
        $output .= '<p style="text-align:center; padding: 40px 20px; color: #6b7280;">선택한 날짜에 등록된 뉴스가 없습니다.</p>';
        $output .= jenny_get_styles();
        return $output;
    }

    $output .= '<div class="jenny-news-grid">';

    $category_map = array(
        'Society' => '사회',
        'Economy' => '경제',
        'Culture' => '문화',
        'Policy' => '정책',
        'Korea-Vietnam' => '한-베',
    );

    foreach ( $sorted_posts as $sorted_post ) {
        $post_obj = get_post( $sorted_post['post_id'] );
        setup_postdata( $post_obj );
        
        $thumb_url = get_the_post_thumbnail_url( $sorted_post['post_id'], 'medium_large' );
        if ( ! $thumb_url ) {
            $thumb_url = 'https://via.placeholder.com/600x400?text=Xin+Chao';
        }

        $news_category = get_post_meta( $sorted_post['post_id'], 'news_category', true );
        if ( ! empty( $news_category ) ) {
            $cat_name = isset( $category_map[ $news_category ] ) ? $category_map[ $news_category ] : $news_category;
        } else {
            $categories = get_the_category( $sorted_post['post_id'] );
            $cat_name = ! empty( $categories ) ? $categories[0]->name : '뉴스';
        }
        
        $excerpt = get_the_excerpt( $sorted_post['post_id'] );
        if ( empty( $excerpt ) ) {
            $excerpt = wp_trim_words( $post_obj->post_content, 20 );
        }

        $link_url = get_permalink( $sorted_post['post_id'] );

        $output .= '<div class="jenny-news-card">';
        $output .= '<div class="jenny-card-image">';
        $output .= '<a href="' . esc_url( $link_url ) . '">';
        $output .= '<img src="' . esc_url( $thumb_url ) . '" alt="' . esc_attr( get_the_title( $sorted_post['post_id'] ) ) . '">';
        $output .= '</a>';
        $output .= '<span class="jenny-badge">' . esc_html( $cat_name ) . '</span>';
        $output .= '</div>';
        $output .= '<div class="jenny-content">';
        $output .= '<div class="jenny-date">' . get_the_date( 'Y.m.d H:i', $sorted_post['post_id'] ) . '</div>';
        $output .= '<h3 class="jenny-title"><a href="' . esc_url( $link_url ) . '">' . get_the_title( $sorted_post['post_id'] ) . '</a></h3>';
        $output .= '<div class="jenny-excerpt">' . $excerpt . '</div>';
        $output .= '<a href="' . esc_url( $link_url ) . '" class="jenny-link">자세히 보기 →</a>';
        $output .= '</div>';
        $output .= '</div>';
    }

    $output .= '</div>';

    wp_reset_postdata();

    $output .= jenny_get_styles();

    return $output;
}
add_shortcode( 'daily_news_list', 'jenny_daily_news_shortcode' );

function jenny_get_styles() {
    return '<style>
        .jenny-date-filter {
            margin-bottom: 24px;
            padding: 16px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .jenny-info-bar {
            display: flex;
            gap: 16px;
            align-items: center;
            flex-wrap: wrap;
        }
        .jenny-info-card {
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
        .jenny-card-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 8px;
        }
        .jenny-card-icon {
            font-size: 16px;
        }
        .jenny-card-title {
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .jenny-card-chips {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .jenny-weather-chip {
            display: flex;
            align-items: center;
            gap: 4px;
            background: #ffffff;
            padding: 6px 10px;
            border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            border: 1px solid #e5e7eb;
        }
        .jenny-chip-city {
            font-size: 12px;
            font-weight: 600;
            color: #374151;
        }
        .jenny-chip-temp {
            font-size: 13px;
            font-weight: 700;
            color: #ea580c;
        }
        .jenny-fx-chip {
            display: flex;
            align-items: center;
            gap: 6px;
            background: #ffffff;
            padding: 6px 10px;
            border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            border: 1px solid #e5e7eb;
        }
        .jenny-fx-flag {
            font-size: 14px;
        }
        .jenny-fx-label {
            font-size: 11px;
            color: #6b7280;
            font-weight: 500;
        }
        .jenny-fx-value {
            font-size: 13px;
            font-weight: 700;
            color: #059669;
        }
        .jenny-card-source {
            font-size: 9px;
            color: #9ca3af;
            font-weight: 400;
            margin-left: 4px;
        }
        .jenny-filter-buttons {
            display: flex;
            gap: 12px;
            align-items: center;
            margin-left: auto;
        }
        @media (max-width: 900px) {
            .jenny-info-bar {
                flex-direction: column;
                align-items: flex-start;
            }
            .jenny-filter-buttons {
                margin-left: 0;
                margin-top: 12px;
            }
        }
        .jenny-filter-btn {
            display: inline-block;
            padding: 10px 20px;
            background: #f3f4f6;
            color: #374151;
            text-decoration: none;
            border: 1px solid #e5e7eb;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
        }
        .jenny-filter-btn:hover {
            background: #e5e7eb;
            color: #111827;
        }
        .jenny-filter-btn.active {
            background: #ea580c;
            color: #ffffff;
            border-color: #ea580c;
        }
        .jenny-archive-wrapper {
            position: relative;
        }
        .jenny-date-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            background: #ffffff;
            border: 1px solid #e5e7eb;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            z-index: 100;
            min-width: 180px;
            max-height: 300px;
            overflow-y: auto;
        }
        .jenny-archive-wrapper:hover .jenny-date-dropdown {
            display: block;
        }
        .jenny-date-option {
            display: block;
            padding: 10px 16px;
            color: #374151;
            text-decoration: none;
            font-size: 14px;
            border-bottom: 1px solid #f3f4f6;
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
        .jenny-filter-info {
            margin-top: 12px;
            padding: 10px 16px;
            background: #fef3c7;
            color: #92400e;
            font-size: 14px;
            border-left: 3px solid #ea580c;
        }
        .jenny-filter-info a {
            color: #ea580c;
            font-weight: 600;
        }
        .jenny-news-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 24px;
            padding: 20px 0;
        }
        .jenny-news-card {
            background: #ffffff;
            overflow: hidden;
            border: 1px solid #e5e7eb;
            display: flex;
            flex-direction: column;
        }
        .jenny-news-card:hover {
            border-color: #9ca3af;
        }
        .jenny-card-image {
            position: relative;
            padding-top: 56.25%;
            overflow: hidden;
        }
        .jenny-card-image img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .jenny-badge {
            position: absolute;
            top: 12px;
            left: 12px;
            background: #ffffff;
            color: #ea580c;
            padding: 4px 12px;
            font-size: 12px;
            font-weight: 700;
            border: 1px solid #e5e7eb;
            z-index: 10;
        }
        .jenny-content {
            padding: 24px;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            text-align: left;
        }
        .jenny-date {
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 8px;
        }
        .jenny-title {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            margin: 0 0 12px 0;
            line-height: 1.4;
        }
        .jenny-title a {
            color: inherit;
            text-decoration: none;
        }
        .jenny-excerpt {
            font-size: 14px;
            color: #4b5563;
            line-height: 1.6;
            margin-bottom: 20px;
            flex-grow: 1;
        }
        .jenny-link {
            font-size: 14px;
            font-weight: 600;
            color: #4b5563;
            text-decoration: none;
            margin-top: auto;
        }
        .jenny-link:hover {
            color: #ea580c;
        }
    </style>';
}
