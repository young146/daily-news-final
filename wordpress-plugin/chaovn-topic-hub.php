<?php
/**
 * Plugin Name: ChaoVN Topic Hub
 * Plugin URI: https://chaovietnam.co.kr
 * Description: 주제 관문(허브) 페이지의 부품. 주제 사전에 맞는 기사를 자동으로 모아 보여준다. [chaovn_hub topic="visa" mode="latest"]
 * Version: 1.0.0
 * Author: Chao Vietnam Team
 * License: GPL v2 or later
 *
 * ════════════════════════════════════════════════════════════════
 * 왜 만들었나 (2026-09-03 실측에 근거)
 * ────────────────────────────────────────────────────────────────
 * 서치콘솔 90일 실측: "베트남 여행" 21.4위, "나트랑 여행"·"푸꾸옥 여행" 노출 0.
 * 원인을 파보니 콘텐츠 부족이 아니었다 — 베트남 내부 콘텐츠가 1,310편 있고 74%가
 * 이미 검색 노출 중이다. 없는 것은 **그것들을 묶는 관문 페이지**였다.
 * 창고에 물건은 가득한데 간판도 진열대도 없는 상태.
 *
 * 그런데 "베트남 여행" 같은 큰 검색어는 여행사·OTA 가 지키는 자리라 우리가 못 이긴다.
 * 우리 자산은 교민 매체 구조다 — 호치민 333편 / 다낭 22편 / 푸꾸옥 4편.
 * 여행객이 가는 도시에 콘텐츠가 없다.
 *
 * 대신 **우리가 이길 수 있는 자리**가 데이터에 있었다. 클릭 효율 최상위가
 * 「베트남 입국 절차와 PAI 신고 — 2026년 7월 변경」(31클릭 8.2위),
 * 「비엣젯 항공의 모르면 손해보는 서비스」(51클릭 4.6위) 같은 **제도·실무 정보**였다.
 * 맛집은 블로거가 이기지만 제도는 매체가 이긴다. 게다가 제도는 자주 바뀌어
 * 남의 페이지는 낡는데, 우리는 매일 베트남 뉴스를 번역하니 **최신성으로 이긴다.**
 *
 * 이 플러그인이 하는 일:
 *   관문 페이지에 "이 주제의 최신 제도 변경"과 "함께 볼 안내 기사"를 자동으로 채운다.
 *   사람이 매번 링크를 손보지 않아도 페이지가 늙지 않는다. (이게 핵심이다 —
 *   손이 가는 구조는 반드시 방치된다)
 *
 * 왜 제목만 보고 고르나:
 *   전문(본문) 검색을 써보니 '비자'로 채권시장 기사가 걸렸다(2026-09-03 실측).
 *   본문에 한 번 스친 단어까지 잡으면 관문이 쓰레기로 채워진다. **제목에 있는 것만** 쓴다.
 * ════════════════════════════════════════════════════════════════
 */

if (!defined('ABSPATH')) {
    exit;
}

define('CHAOVN_HUB_VER', '1.0.0');

// 데일리 뉴스 카테고리 — 다른 플러그인이 이미 정의했으면 그것을 따른다(값을 두 곳에 적지 않는다)
if (!defined('CHAOVN_NEWS_CAT_ID')) {
    define('CHAOVN_NEWS_CAT_ID', 31);
}

/**
 * 주제 사전.
 * 새 관문을 만들 때 여기에 한 줄 추가하면 된다 — 페이지 쪽은 안 고쳐도 된다.
 *
 * words   : 제목에 이 중 하나가 있으면 그 주제의 글로 본다
 * exclude : 같은 낱말이 다른 뜻으로 쓰이는 경우를 걸러낸다
 */
function chaovn_hub_topics() {
    return array(
        'visa' => array(
            'label'   => '입국·비자·체류',
            'words'   => array('비자', '입국', 'PAI', '체류', '거주증', '노동허가', '무비자',
                               'E-visa', '이비자', '출입국', '여권', '외국인 등록', 'TRC'),
            // '투자 비자', '인재 비자' 같은 정책 논평은 여행자에게 쓸모가 없다
            'exclude' => array('채권', '증시', '주가', '환율', '금리'),
        ),
        'flight' => array(
            'label'   => '항공·교통',
            'words'   => array('항공', '노선', '취항', '공항', '비행기', '결항', '지연'),
            'exclude' => array('공항철도 한국'),
        ),
        'money' => array(
            'label'   => '환전·송금·결제',
            'words'   => array('환전', '송금', '환율', '계좌', '카드 결제', 'ATM'),
            'exclude' => array(),
        ),
    );
}

/**
 * 주제에 맞는 글을 찾는다.
 *
 * @param array  $topic  주제 정의
 * @param string $mode   'latest' = 데일리 뉴스(제도 변경) / 'guide' = 잡지 안내 기사
 * @param int    $count  최대 개수
 */
function chaovn_hub_query($topic, $mode, $count) {
    // 제목 매칭은 SQL 로 한다 — WP_Query 의 s= 는 본문까지 뒤져 노이즈가 심하다.
    global $wpdb;

    $likes = array();
    foreach ($topic['words'] as $w) {
        $likes[] = $wpdb->prepare('p.post_title LIKE %s', '%' . $wpdb->esc_like($w) . '%');
    }
    if (!$likes) return array();
    $where_words = '(' . implode(' OR ', $likes) . ')';

    $where_not = '';
    foreach ($topic['exclude'] as $w) {
        $where_not .= $wpdb->prepare(' AND p.post_title NOT LIKE %s', '%' . $wpdb->esc_like($w) . '%');
    }

    $news = (int) CHAOVN_NEWS_CAT_ID;
    // 데일리 뉴스 안인가 밖인가로 갈린다. 하위 카테고리까지 포함해야 새어나가지 않는다.
    $cat_ids = array_merge(array($news), get_term_children($news, 'category'));
    $cat_ids = array_map('intval', array_filter($cat_ids));
    $cat_in  = implode(',', $cat_ids);

    $rel = ($mode === 'latest') ? 'IN' : 'NOT IN';

    $sql = "
        SELECT p.ID, p.post_title, p.post_date
        FROM {$wpdb->posts} p
        WHERE p.post_status = 'publish' AND p.post_type = 'post'
          AND {$where_words} {$where_not}
          AND p.ID {$rel} (
              SELECT tr.object_id FROM {$wpdb->term_relationships} tr
              INNER JOIN {$wpdb->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
              WHERE tt.taxonomy = 'category' AND tt.term_id IN ({$cat_in})
          )
        ORDER BY p.post_date DESC
        LIMIT %d";

    return $wpdb->get_results($wpdb->prepare($sql, max(1, min(20, (int) $count))));
}

/**
 * [chaovn_hub topic="visa" mode="latest" count="5"]
 *
 * mode="latest" — 데일리 뉴스에서 이 주제의 최근 소식 (제도 변경 추적)
 * mode="guide"  — 잡지 아카이브에서 이 주제의 안내 기사
 */
add_shortcode('chaovn_hub', 'chaovn_hub_shortcode');
function chaovn_hub_shortcode($atts) {
    $a = shortcode_atts(array(
        'topic' => 'visa',
        'mode'  => 'latest',
        'count' => 5,
        'title' => '',
    ), $atts, 'chaovn_hub');

    $topics = chaovn_hub_topics();
    if (!isset($topics[$a['topic']])) return '';
    $topic = $topics[$a['topic']];
    $mode  = ($a['mode'] === 'guide') ? 'guide' : 'latest';

    // 캐시 — 관문 페이지는 많이 열리는데 매번 SQL 을 돌 이유가 없다.
    // 6시간이면 "오늘 바뀐 제도"를 놓치지 않으면서 부하도 없다.
    $key  = 'chaovn_hub_' . $a['topic'] . '_' . $mode . '_' . (int) $a['count'];
    $rows = get_transient($key);
    if ($rows === false) {
        $rows = chaovn_hub_query($topic, $mode, (int) $a['count']);
        set_transient($key, $rows, 6 * HOUR_IN_SECONDS);
    }

    // 결과가 없으면 **아무것도 그리지 않는다.** 빈 상자가 페이지에 남으면 관리 안 된 사이트로 보인다.
    if (empty($rows)) return '';

    $heading = $a['title'] !== '' ? $a['title']
        : ($mode === 'latest' ? $topic['label'] . ' — 최근 소식' : '함께 보면 좋은 안내');

    $out  = '<div class="chaovn-hub chaovn-hub-' . esc_attr($mode) . '">';
    $out .= '<h3 class="chaovn-hub-title">' . esc_html($heading) . '</h3>';
    $out .= '<ul class="chaovn-hub-list">';
    foreach ($rows as $r) {
        $date = ($mode === 'latest')
            ? '<span class="chaovn-hub-date">' . esc_html(mysql2date('Y.m.d', $r->post_date)) . '</span> '
            : '';
        $out .= '<li>' . $date . '<a href="' . esc_url(get_permalink($r->ID)) . '">'
              . esc_html(wp_strip_all_tags($r->post_title)) . '</a></li>';
    }
    $out .= '</ul>';
    if ($mode === 'latest') {
        // 이 한 줄이 이 페이지의 차별점이다 — "언제 기준인지"를 밝히는 페이지는 흔치 않다.
        $out .= '<p class="chaovn-hub-note">이 목록은 새 기사가 나오면 자동으로 갱신됩니다. '
              . '제도는 예고 없이 바뀔 수 있으니 <strong>출발 전 공식 안내를 한 번 더 확인</strong>하세요.</p>';
    }
    $out .= '</div>';
    return $out;
}

/**
 * 최소한의 스타일. 테마(Sahifa)를 이기려 들지 않는다 — 색·글꼴은 테마를 따르고
 * 여백과 구분선만 준다. 테마가 바뀌어도 깨지지 않는 범위.
 */
add_action('wp_head', 'chaovn_hub_style', 99);
function chaovn_hub_style() {
    if (!is_page()) return;
    echo '<style id="chaovn-hub-style">
.chaovn-hub{border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;margin:22px 0;background:#fafafa}
.chaovn-hub-title{margin:0 0 10px;font-size:1.05em}
.chaovn-hub-list{margin:0;padding-left:1.1em}
.chaovn-hub-list li{margin:6px 0;line-height:1.5}
.chaovn-hub-date{color:#6b7280;font-size:.9em;margin-right:6px}
.chaovn-hub-note{margin:12px 0 0;font-size:.9em;color:#6b7280}
@media (prefers-color-scheme:dark){.chaovn-hub{background:transparent;border-color:#374151}}
</style>' . "\n";
}

/**
 * 새 글이 나오면 캐시를 버린다 — 6시간을 기다리지 않고 바로 반영된다.
 * (데일리 뉴스는 하루 47건 발행되므로 사실상 실시간이 된다)
 */
add_action('publish_post', 'chaovn_hub_purge');
function chaovn_hub_purge() {
    global $wpdb;
    $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_chaovn_hub_%'");
    $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_chaovn_hub_%'");
}
