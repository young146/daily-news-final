<?php
/**
 * Plugin Name: XinChao Image Uploader
 * Description: REST API endpoint for uploading images from external URLs (bypasses hotlink protection and SSL issues)
 * Version: 1.1
 * Author: XinChao Vietnam
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('rest_api_init', function () {
    register_rest_route('xinchao/v1', '/upload-image', array(
        'methods' => 'POST',
        'callback' => 'xinchao_upload_image_from_url',
        'permission_callback' => function () {
            return current_user_can('upload_files');
        }
    ));
});

function xinchao_upload_image_from_url($request) {
    $image_url = $request->get_param('image_url');
    $title = $request->get_param('title');
    
    if (empty($image_url)) {
        return new WP_Error('no_url', 'Image URL is required', array('status' => 400));
    }

    require_once(ABSPATH . 'wp-admin/includes/media.php');
    require_once(ABSPATH . 'wp-admin/includes/file.php');
    require_once(ABSPATH . 'wp-admin/includes/image.php');

    $tmp_file = xinchao_download_image($image_url);
    
    if (is_wp_error($tmp_file)) {
        return $tmp_file;
    }

    $filename = !empty($title) ? sanitize_file_name($title) : basename(parse_url($image_url, PHP_URL_PATH));
    
    $path_info = pathinfo($filename);
    if (empty($path_info['extension']) || !in_array(strtolower($path_info['extension']), array('jpg', 'jpeg', 'png', 'gif', 'webp'))) {
        $filename .= '.jpg';
    }

    $file_array = array(
        'name' => $filename,
        'tmp_name' => $tmp_file
    );

    $attachment_id = media_handle_sideload($file_array, 0, $title);
    
    @unlink($tmp_file);
    
    if (is_wp_error($attachment_id)) {
        return $attachment_id;
    }

    $attachment_url = wp_get_attachment_url($attachment_id);

    return array(
        'success' => true,
        'attachment_id' => $attachment_id,
        'url' => $attachment_url
    );
}

function xinchao_download_image($url) {
    $parsed_url = parse_url($url);
    $referer = $parsed_url['scheme'] . '://' . $parsed_url['host'] . '/';
    $host = $parsed_url['host'];
    
    // Check if this is a problematic SSL host (Yonhap, VNA, etc.)
    $ssl_problem_hosts = array('img3.yna.co.kr', 'img.yna.co.kr', 'vnanet.vn', 'image.vnanet.vn');
    $disable_ssl = false;
    foreach ($ssl_problem_hosts as $problem_host) {
        if (strpos($host, $problem_host) !== false || strpos($url, $problem_host) !== false) {
            $disable_ssl = true;
            break;
        }
    }
    
    $args = array(
        'timeout' => 60,
        'redirection' => 5,
        'httpversion' => '1.1',
        'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'headers' => array(
            'Referer' => $referer,
            'Accept' => 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language' => 'en-US,en;q=0.9,vi;q=0.8,ko;q=0.7'
        )
    );
    
    // Disable SSL verification for problematic hosts
    if ($disable_ssl) {
        $args['sslverify'] = false;
    }
    
    $response = wp_remote_get($url, $args);
    
    if (is_wp_error($response)) {
        // If SSL error, try again with SSL disabled
        if (strpos($response->get_error_message(), 'SSL') !== false || 
            strpos($response->get_error_message(), 'cURL error 35') !== false) {
            $args['sslverify'] = false;
            $response = wp_remote_get($url, $args);
        }
        
        if (is_wp_error($response)) {
            return $response;
        }
    }
    
    $response_code = wp_remote_retrieve_response_code($response);
    if ($response_code !== 200) {
        return new WP_Error('download_failed', 'Failed to download image: HTTP ' . $response_code, array('status' => 500));
    }
    
    $body = wp_remote_retrieve_body($response);
    if (empty($body)) {
        return new WP_Error('empty_response', 'Empty response from image URL', array('status' => 500));
    }
    
    $tmp_file = wp_tempnam();
    file_put_contents($tmp_file, $body);
    
    return $tmp_file;
}
