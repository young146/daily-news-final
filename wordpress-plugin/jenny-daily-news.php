<?php
/**
 * Plugin Name: Jenny Daily News Display
 * Description: Displays daily news summaries in a beautiful card layout using the shortcode [daily_news_list]. Links directly to full article.
 * Version: 1.2
 * Author: Jenny (Antigravity)
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Register custom meta field for REST API
add_action( 'init', function() {
    register_post_meta( 'post', 'full_article_url', array(
        'show_in_rest' => true,
        'single' => true,
        'type' => 'string',
        'auth_callback' => function() {
            return current_user_can( 'edit_posts' );
        }
    ));
});

function jenny_daily_news_shortcode( $atts ) {
    $atts = shortcode_atts( array(
        'count' => 12,
        'category' => 711,
    ), $atts );

    $args = array(
        'post_type' => 'post',
        'posts_per_page' => $atts['count'],
        'cat' => $atts['category'],
        'post_status' => 'publish',
        'orderby' => 'date',
        'order' => 'DESC',
    );

    $query = new WP_Query( $args );

    if ( ! $query->have_posts() ) {
        return '<p style="text-align:center; padding: 20px;">아직 등록된 데일리 뉴스가 없습니다.</p>';
    }

    $output = '<div class="jenny-news-grid">';

    while ( $query->have_posts() ) {
        $query->the_post();
        
        $thumb_url = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' );
        if ( ! $thumb_url ) {
            $thumb_url = 'https://via.placeholder.com/600x400?text=Xin+Chao';
        }

        $categories = get_the_category();
        $cat_name = ! empty( $categories ) ? $categories[0]->name : 'News';
        
        $excerpt = get_the_excerpt();
        if ( empty( $excerpt ) ) {
            $excerpt = wp_trim_words( get_the_content(), 20 );
        }

        // Get full article URL from custom field, fallback to permalink
        $full_article_url = get_post_meta( get_the_ID(), 'full_article_url', true );
        $link_url = ! empty( $full_article_url ) ? $full_article_url : get_permalink();

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

    $output .= '
    <style>
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
    </style>
    ';

    return $output;
}
add_shortcode( 'daily_news_list', 'jenny_daily_news_shortcode' );
