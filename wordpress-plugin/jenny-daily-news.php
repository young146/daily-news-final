<?php
/**
 * Plugin Name: Jenny Daily News Display
 * Description: Displays daily news in a beautiful card layout using the shortcode [daily_news_list]. Shows excerpt and links to full article.
 * Version: 1.4
 * Author: Jenny (Antigravity)
 * Requires PHP: 5.4
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Register custom meta fields for REST API (only if function exists - WP 4.9.8+)
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
        'count' => 12,
        'category' => 31,
    ), $atts );

    // Check for date filter from URL parameter
    $selected_date = isset( $_GET['news_date'] ) ? sanitize_text_field( $_GET['news_date'] ) : '';
    $is_filtered = ! empty( $selected_date );

    $args = array(
        'post_type' => 'post',
        'posts_per_page' => $is_filtered ? 50 : $atts['count'],
        'cat' => $atts['category'],
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
    );

    // Add date filter if specified
    if ( $is_filtered ) {
        $date_parts = explode( '-', $selected_date );
        if ( count( $date_parts ) === 3 ) {
            $args['date_query'] = array(
                array(
                    'year'  => intval( $date_parts[0] ),
                    'month' => intval( $date_parts[1] ),
                    'day'   => intval( $date_parts[2] ),
                ),
            );
        }
    }

    $query = new WP_Query( $args );

    // Get available dates for the date picker
    $date_args = array(
        'post_type' => 'post',
        'posts_per_page' => 100,
        'cat' => $atts['category'],
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

    // Build date picker output
    $current_url = strtok( $_SERVER['REQUEST_URI'], '?' );
    
    $output = '<div class="jenny-date-filter">';
    $output .= '<div class="jenny-filter-row">';
    
    // Today's news button (default view)
    $today_active = ! $is_filtered ? ' active' : '';
    $output .= '<a href="' . esc_url( $current_url ) . '" class="jenny-filter-btn' . $today_active . '">오늘의 뉴스</a>';
    
    // Archive button with date picker
    $output .= '<div class="jenny-archive-wrapper">';
    $output .= '<button type="button" class="jenny-filter-btn jenny-archive-btn' . ( $is_filtered ? ' active' : '' ) . '">지난 뉴스 보기 ▼</button>';
    $output .= '<div class="jenny-date-dropdown">';
    
    foreach ( $available_dates as $date ) {
        $date_display = date_i18n( 'Y년 m월 d일', strtotime( $date ) );
        $date_active = ( $selected_date === $date ) ? ' selected' : '';
        $output .= '<a href="' . esc_url( $current_url . '?news_date=' . $date ) . '" class="jenny-date-option' . $date_active . '">' . esc_html( $date_display ) . '</a>';
    }
    
    $output .= '</div>'; // .jenny-date-dropdown
    $output .= '</div>'; // .jenny-archive-wrapper
    $output .= '</div>'; // .jenny-filter-row
    
    // Show current filter info
    if ( $is_filtered ) {
        $display_date = date_i18n( 'Y년 m월 d일', strtotime( $selected_date ) );
        $output .= '<div class="jenny-filter-info">' . esc_html( $display_date ) . ' 뉴스를 보고 있습니다. <a href="' . esc_url( $current_url ) . '">오늘의 뉴스로 돌아가기</a></div>';
    }
    
    $output .= '</div>'; // .jenny-date-filter

    if ( ! $query->have_posts() ) {
        $output .= '<p style="text-align:center; padding: 40px 20px; color: #6b7280;">선택한 날짜에 등록된 뉴스가 없습니다.</p>';
        return $output . jenny_get_styles();
    }

    $output .= '<div class="jenny-news-grid">';

    while ( $query->have_posts() ) {
        $query->the_post();
        
        $thumb_url = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' );
        if ( ! $thumb_url ) {
            $thumb_url = 'https://via.placeholder.com/600x400?text=Xin+Chao';
        }

        // Get news category from custom field first, fallback to WordPress category
        $news_category = get_post_meta( get_the_ID(), 'news_category', true );
        if ( ! empty( $news_category ) ) {
            // Translate category names to Korean
            $category_map = array(
                'Society' => '사회',
                'Economy' => '경제',
                'Culture' => '문화',
                'Policy' => '정책',
                'Korea-Vietnam' => '한-베',
            );
            $cat_name = isset( $category_map[ $news_category ] ) ? $category_map[ $news_category ] : $news_category;
        } else {
            $categories = get_the_category();
            $cat_name = ! empty( $categories ) ? $categories[0]->name : '뉴스';
        }
        
        $excerpt = get_the_excerpt();
        if ( empty( $excerpt ) ) {
            $excerpt = wp_trim_words( get_the_content(), 20 );
        }

        // Link directly to the article
        $link_url = get_permalink();

        $output .= '
        <div class="jenny-news-card">
            <div class="jenny-card-image">
                <a href="' . esc_url( $link_url ) . '">
                    <img src="' . esc_url( $thumb_url ) . '" alt="' . esc_attr( get_the_title() ) . '">
                </a>
                <span class="jenny-badge">' . esc_html( $cat_name ) . '</span>
            </div>
            <div class="jenny-content">
                <div class="jenny-date">' . get_the_date( 'Y.m.d H:i' ) . '</div>
                <h3 class="jenny-title"><a href="' . esc_url( $link_url ) . '">' . get_the_title() . '</a></h3>
                <div class="jenny-excerpt">' . $excerpt . '</div>
                <a href="' . esc_url( $link_url ) . '" class="jenny-link">자세히 보기 →</a>
            </div>
        </div>';
    }

    $output .= '</div>';

    wp_reset_postdata();

    $output .= jenny_get_styles();

    return $output;
}
add_shortcode( 'daily_news_list', 'jenny_daily_news_shortcode' );

function jenny_get_styles() {
    return '
    <style>
        .jenny-date-filter {
            margin-bottom: 24px;
            padding: 16px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .jenny-filter-row {
            display: flex;
            gap: 12px;
            align-items: center;
            flex-wrap: wrap;
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
            transition: all 0.2s;
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
        .jenny-archive-wrapper:hover .jenny-date-dropdown,
        .jenny-archive-wrapper:focus-within .jenny-date-dropdown {
            display: block;
        }
        .jenny-date-option {
            display: block;
            padding: 10px 16px;
            color: #374151;
            text-decoration: none;
            font-size: 14px;
            border-bottom: 1px solid #f3f4f6;
            transition: background 0.2s;
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
            border-radius: 0;
            overflow: hidden;
            box-shadow: none;
            border: 1px solid #e5e7eb;
            display: flex;
            flex-direction: column;
            transition: border-color 0.3s ease;
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
            transition: transform 0.5s ease;
        }
        .jenny-news-card:hover .jenny-card-image img {
            transform: scale(1.05);
        }
        .jenny-badge {
            position: absolute;
            top: 12px;
            left: 12px;
            background: #ffffff;
            color: #ea580c;
            padding: 4px 12px;
            border-radius: 0;
            font-size: 12px;
            font-weight: 700;
            box-shadow: none;
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
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
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
            display: inline-flex;
            align-items: center;
            margin-top: auto;
            transition: color 0.2s;
        }
        .jenny-link:hover {
            color: #ea580c;
        }
        @media (max-width: 640px) {
            .jenny-filter-row {
                flex-direction: column;
                align-items: stretch;
            }
            .jenny-filter-btn {
                text-align: center;
            }
            .jenny-date-dropdown {
                position: fixed;
                left: 16px;
                right: 16px;
                top: 50%;
                transform: translateY(-50%);
                max-height: 60vh;
            }
        }
    </style>
    ';
}
