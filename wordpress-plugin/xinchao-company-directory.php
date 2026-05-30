<?php
/**
 * Plugin Name: Xinchao Company Directory
 * Description: 베트남 진출 한국기업 디렉토리 — [company_directory] shortcode로 검색·필터·리스트 표시. 어드민 메뉴에서 CSV 일괄 업로드 가능. 이메일은 보관하지 않음 (개인정보 보호).
 * Version: 1.0.0
 * Author: Xinchao News
 * Text Domain: xinchao-cd
 *
 * 설치:
 *   1. 이 파일을 /wp-content/plugins/xinchao-company-directory.php 에 업로드
 *   2. WP 관리자 → 플러그인 → "Xinchao Company Directory" 활성화
 *   3. 어드민 메뉴 → "기업 디렉토리" → CSV 업로드
 *   4. 페이지에 [company_directory] shortcode 삽입
 */

if (!defined('ABSPATH')) {
    exit;
}

// ============================================================================
// 상수
// ============================================================================

define('XCD_VERSION', '1.0.0');
define('XCD_TABLE', 'xinchao_companies');  // wp_ 접두사 미포함 (wpdb가 자동)
define('XCD_PER_PAGE', 24);
define('XCD_AJAX_ACTION', 'xcd_search');

// ============================================================================
// 활성화: 테이블 생성
// ============================================================================

function xcd_activate() {
    global $wpdb;
    $table = $wpdb->prefix . XCD_TABLE;
    $charset = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE $table (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company VARCHAR(255) NOT NULL,
        director VARCHAR(120) DEFAULT NULL,
        industry_group VARCHAR(50) DEFAULT NULL,
        industry_detail VARCHAR(255) DEFAULT NULL,
        area VARCHAR(50) DEFAULT NULL,
        address VARCHAR(500) DEFAULT NULL,
        tel VARCHAR(80) DEFAULT NULL,
        homepage VARCHAR(255) DEFAULT NULL,
        email VARCHAR(500) DEFAULT NULL,
        source VARCHAR(50) DEFAULT NULL,
        source_url VARCHAR(500) DEFAULT NULL,
        search_text TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_area (area),
        KEY idx_group (industry_group),
        KEY idx_company (company(100))
    ) $charset;";

    require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
    dbDelta($sql);
}
register_activation_hook(__FILE__, 'xcd_activate');

// 비활성화: 테이블은 유지 (실수로 데이터 잃지 않도록)
// 완전 삭제 원하면 phpMyAdmin에서 수동 DROP

// ============================================================================
// 어드민 메뉴
// ============================================================================

function xcd_admin_menu() {
    add_menu_page(
        '기업 디렉토리',
        '기업 디렉토리',
        'manage_options',
        'xcd-admin',
        'xcd_admin_page',
        'dashicons-building',
        30
    );
}
add_action('admin_menu', 'xcd_admin_menu');

function xcd_admin_page() {
    global $wpdb;
    $table = $wpdb->prefix . XCD_TABLE;

    // CSV 업로드 처리
    $msg = '';
    if (!empty($_POST['xcd_action']) && check_admin_referer('xcd_import_nonce')) {
        if ($_POST['xcd_action'] === 'import' && !empty($_FILES['csv_file']['tmp_name'])) {
            $result = xcd_import_csv($_FILES['csv_file']['tmp_name'], !empty($_POST['truncate']));
            $msg = '<div class="notice notice-success"><p>' . esc_html($result) . '</p></div>';
        } elseif ($_POST['xcd_action'] === 'truncate') {
            $wpdb->query("TRUNCATE TABLE $table");
            $msg = '<div class="notice notice-warning"><p>전체 삭제 완료 (테이블 비움)</p></div>';
        }
    }

    $count = $wpdb->get_var("SELECT COUNT(*) FROM $table");
    $area_stats = $wpdb->get_results("SELECT area, COUNT(*) AS c FROM $table GROUP BY area ORDER BY c DESC LIMIT 10");
    ?>
    <div class="wrap">
        <h1>기업 디렉토리 관리</h1>
        <?php echo $msg; ?>

        <h2>현재 상태</h2>
        <p><strong>총 등록 회사: <?php echo number_format($count); ?>개</strong></p>
        <?php if ($count > 0): ?>
            <p>지역별 상위 10:</p>
            <ul style="list-style: disc; padding-left: 20px;">
                <?php foreach ($area_stats as $row): ?>
                    <li><?php echo esc_html($row->area ?: '(미상)') . ' — ' . number_format($row->c) . '개'; ?></li>
                <?php endforeach; ?>
            </ul>
        <?php endif; ?>

        <hr>

        <h2>CSV 업로드</h2>
        <p>CSV 컬럼 순서: <code>company, director, industry_group, industry_detail, area, address, tel, homepage, source, source_url</code></p>
        <p>UTF-8 (BOM 가능). 헤더 행 1줄 필수.</p>

        <form method="post" enctype="multipart/form-data">
            <?php wp_nonce_field('xcd_import_nonce'); ?>
            <input type="hidden" name="xcd_action" value="import">
            <table class="form-table">
                <tr>
                    <th><label for="csv_file">CSV 파일</label></th>
                    <td><input type="file" name="csv_file" id="csv_file" accept=".csv" required></td>
                </tr>
                <tr>
                    <th>기존 데이터 처리</th>
                    <td>
                        <label><input type="checkbox" name="truncate" value="1"> 업로드 전 테이블 비우기 (전체 교체)</label>
                        <p class="description">체크 안 하면 기존 데이터는 유지하고 신규만 추가됩니다 (회사명+지역 기준 중복 검사).</p>
                    </td>
                </tr>
            </table>
            <p class="submit"><input type="submit" class="button-primary" value="업로드 및 가져오기"></p>
        </form>

        <hr>

        <h2>사용 방법</h2>
        <p>회사 디렉토리를 표시할 페이지에 다음 shortcode를 삽입하세요:</p>
        <pre style="background:#f0f0f0;padding:10px;font-size:14px;">[company_directory]</pre>
        <p>옵션:</p>
        <pre style="background:#f0f0f0;padding:10px;font-size:14px;">[company_directory per_page="30" default_area="HCMC"]</pre>
    </div>
    <?php
}

// ============================================================================
// CSV 가져오기 (배치 INSERT)
// ============================================================================

function xcd_import_csv($file_path, $truncate = false) {
    global $wpdb;
    $table = $wpdb->prefix . XCD_TABLE;

    if ($truncate) {
        $wpdb->query("TRUNCATE TABLE $table");
    }

    if (($fh = fopen($file_path, 'r')) === false) {
        return '파일 열기 실패';
    }

    // BOM 검출 후 건너뛰기 (utf-8-sig 대응)
    $bom_check = fread($fh, 3);
    if ($bom_check !== "\xEF\xBB\xBF") {
        rewind($fh);  // BOM 없으면 처음부터 읽기
    }
    // BOM 있으면 이미 3바이트 건너뛴 상태 → 그대로 진행

    $header = fgetcsv($fh);
    if (!$header) {
        fclose($fh);
        return '헤더를 읽을 수 없음';
    }
    $header = array_map('trim', $header);
    $idx = array_flip($header);

    $needed = ['company', 'director', 'industry_group', 'industry_detail',
               'area', 'address', 'tel', 'homepage', 'email', 'source', 'source_url'];

    $batch = [];
    $imported = 0;
    $skipped = 0;
    $batch_size = 200;

    // 중복 체크용 set: 회사명(소문자) + area
    $existing_keys = [];
    if (!$truncate) {
        $rows = $wpdb->get_results("SELECT company, area FROM $table");
        foreach ($rows as $r) {
            $existing_keys[strtolower(trim($r->company)) . '|' . trim((string)$r->area)] = true;
        }
    }

    while (($row = fgetcsv($fh)) !== false) {
        if (count($row) < 1 || (count($row) === 1 && trim($row[0]) === '')) continue;

        $get = function($col) use ($row, $idx) {
            return isset($idx[$col]) && isset($row[$idx[$col]]) ? trim($row[$idx[$col]]) : '';
        };

        $company = $get('company');
        $area = $get('area');
        if (!$company) { $skipped++; continue; }

        $key = strtolower($company) . '|' . $area;
        if (isset($existing_keys[$key])) { $skipped++; continue; }
        $existing_keys[$key] = true;

        $industry_group = $get('industry_group');
        $industry_detail = $get('industry_detail');
        $address = $get('address');
        $director = $get('director');
        $tel = $get('tel');

        $email = $get('email');
        $search_text = strtolower($company . ' ' . $director . ' ' . $industry_group . ' '
            . $industry_detail . ' ' . $area . ' ' . $address . ' ' . $tel . ' ' . $email);

        $batch[] = $wpdb->prepare(
            "(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            mb_substr($company, 0, 255),
            mb_substr($director, 0, 120),
            mb_substr($industry_group, 0, 50),
            mb_substr($industry_detail, 0, 255),
            mb_substr($area, 0, 50),
            mb_substr($address, 0, 500),
            mb_substr($tel, 0, 80),
            mb_substr($get('homepage'), 0, 255),
            mb_substr($email, 0, 500),
            mb_substr($get('source'), 0, 50),
            mb_substr($get('source_url'), 0, 500),
            mb_substr($search_text, 0, 65535)
        );

        if (count($batch) >= $batch_size) {
            xcd_flush_batch($batch);
            $imported += count($batch);
            $batch = [];
        }
    }
    fclose($fh);

    if (!empty($batch)) {
        xcd_flush_batch($batch);
        $imported += count($batch);
    }

    return "완료 — 추가: $imported, 중복/제외: $skipped (총 처리 행: " . ($imported + $skipped) . ')';
}

function xcd_flush_batch($batch) {
    global $wpdb;
    $table = $wpdb->prefix . XCD_TABLE;
    $sql = "INSERT INTO $table (company, director, industry_group, industry_detail, area, address, tel, homepage, email, source, source_url, search_text) VALUES "
         . implode(',', $batch);
    $wpdb->query($sql);
}

// ============================================================================
// Shortcode: [company_directory]
// ============================================================================

function xcd_directory_shortcode($atts) {
    $atts = shortcode_atts([
        'per_page' => XCD_PER_PAGE,
        'default_area' => '',
        'default_group' => '',
    ], $atts);

    global $wpdb;
    $table = $wpdb->prefix . XCD_TABLE;

    $areas = $wpdb->get_col("SELECT DISTINCT area FROM $table WHERE area IS NOT NULL AND area != '' ORDER BY area");
    $groups = $wpdb->get_col("SELECT DISTINCT industry_group FROM $table WHERE industry_group IS NOT NULL AND industry_group != '' ORDER BY industry_group");
    $total = (int)$wpdb->get_var("SELECT COUNT(*) FROM $table");

    // 다중 shortcode 안전: 매 호출마다 unique ID 부여
    static $instance = 0;
    $instance++;
    $uid = 'xcd-' . wp_generate_uuid4();

    ob_start();
    // CSS는 첫 번째 호출 시에만 출력 (페이지 내 다중 shortcode 시 중복 방지)
    if ($instance === 1) {
        xcd_print_css();
    }
    ?>
    <div class="xcd-wrap" id="<?php echo esc_attr($uid); ?>" data-perpage="<?php echo esc_attr($atts['per_page']); ?>">
        <div class="xcd-header">
            <h2 class="xcd-title">베트남 진출 한국기업 디렉토리</h2>
            <p class="xcd-subtitle">총 <strong class="xcd-total"><?php echo number_format($total); ?></strong>개 기업 (코참 베트남·호치민 회원사 기준)</p>
        </div>

        <div class="xcd-filters">
            <input type="text" class="xcd-search" placeholder="회사명·주소·대표자 검색..." />
            <select class="xcd-area">
                <option value="">전체 지역</option>
                <?php foreach ($areas as $a): ?>
                    <option value="<?php echo esc_attr($a); ?>" <?php selected($atts['default_area'], $a); ?>><?php echo esc_html($a); ?></option>
                <?php endforeach; ?>
            </select>
            <select class="xcd-group">
                <option value="">전체 업종</option>
                <?php foreach ($groups as $g): ?>
                    <option value="<?php echo esc_attr($g); ?>" <?php selected($atts['default_group'], $g); ?>><?php echo esc_html($g); ?></option>
                <?php endforeach; ?>
            </select>
            <button type="button" class="xcd-reset">초기화</button>
        </div>

        <div class="xcd-status"></div>
        <div class="xcd-list"></div>
        <div class="xcd-pagination"></div>
    </div>

    <!-- 상세 모달 (shortcode 인스턴스당 1개) -->
    <div class="xcd-overlay" id="<?php echo esc_attr($uid); ?>-overlay" role="dialog" aria-modal="true">
        <div class="xcd-modal">
            <div class="xcd-modal-hd">
                <h3 class="xcd-modal-title"></h3>
                <span class="xcd-modal-area"></span>
                <button class="xcd-modal-close" aria-label="닫기">&times;</button>
            </div>
            <div class="xcd-modal-body"></div>
        </div>
    </div>

    <script>
    (function() {
        var wrap = document.getElementById('<?php echo esc_js($uid); ?>');
        if (!wrap) return;
        var ajaxurl = '<?php echo esc_url(admin_url('admin-ajax.php')); ?>';
        var perPage = parseInt(wrap.dataset.perpage) || 24;
        var state = {
            search: '',
            area: wrap.querySelector('.xcd-area').value,
            group: wrap.querySelector('.xcd-group').value,
            page: 1
        };
        var listEl = wrap.querySelector('.xcd-list');
        var statusEl = wrap.querySelector('.xcd-status');
        var pagEl = wrap.querySelector('.xcd-pagination');
        var debounceTimer = null;

        // 모달
        var overlay = document.getElementById('<?php echo esc_js($uid); ?>-overlay');
        var modalTitle = overlay.querySelector('.xcd-modal-title');
        var modalArea = overlay.querySelector('.xcd-modal-area');
        var modalBody = overlay.querySelector('.xcd-modal-body');

        function openModal(c) {
            modalTitle.textContent = c.company || '';
            modalArea.textContent = c.area || '';
            modalArea.style.display = c.area ? 'inline-block' : 'none';

            var rows = [];
            if (c.director) rows.push(['대표자', escapeHtml(c.director)]);
            if (c.industry_group || c.industry_detail) {
                var ind = escapeHtml(c.industry_group || '');
                if (c.industry_detail && c.industry_detail !== c.industry_group) {
                    ind += ' <span style="color:#d1d5db">|</span> ' + escapeHtml(c.industry_detail);
                }
                rows.push(['업종', ind]);
            }
            if (c.address) rows.push(['주소', escapeHtml(c.address)]);
            if (c.tel) rows.push(['전화', escapeHtml(c.tel)]);
            if (c.homepage) rows.push(['홈페이지', '<a href="' + escapeHtml(c.homepage) + '" target="_blank" rel="noopener">' + escapeHtml(c.homepage) + '</a>']);
            if (c.email) {
                var emailLinks = c.email.split(/[,\s]+/).filter(Boolean).map(function(e) {
                    return '<a href="mailto:' + escapeHtml(e.trim()) + '">' + escapeHtml(e.trim()) + '</a>';
                }).join('<br>');
                rows.push(['이메일', emailLinks]);
            }
            if (c.source) {
                var srcVal = escapeHtml(c.source);
                if (c.source_url) srcVal = '<a href="' + escapeHtml(c.source_url) + '" target="_blank" rel="noopener">' + srcVal + ' ↗</a>';
                rows.push(['출처', srcVal]);
            }

            modalBody.innerHTML = rows.map(function(r) {
                return '<div class="xcd-modal-row"><span class="xcd-modal-label">' + r[0] + '</span><span class="xcd-modal-val">' + r[1] + '</span></div>';
            }).join('');

            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
        }

        overlay.querySelector('.xcd-modal-close').addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

        function escapeHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
                return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
            });
        }

        function render(data) {
            statusEl.textContent = data.total ? '검색 결과: ' + data.total.toLocaleString() + '개 기업'
                                              : '검색 결과 없음';
            listEl.innerHTML = '';
            data.items.forEach(function(c) {
                var el = document.createElement('div');
                el.className = 'xcd-card';
                var html = '<div class="xcd-card-inner">';

                // 헤드: 회사명 + 뱃지
                html += '<div class="xcd-card-head">';
                html += '<h3 class="xcd-card-name">' + escapeHtml(c.company) + '</h3>';
                html += '<div class="xcd-card-tags">';
                if (c.area) html += '<span class="xcd-chip-area">' + escapeHtml(c.area) + '</span>';
                if (c.industry_group) html += '<span class="xcd-chip-industry">' + escapeHtml(c.industry_group) + '</span>';
                html += '</div></div>';

                // 정보 행
                html += '<div class="xcd-card-info">';
                if (c.director) html += '<div class="xcd-info-row"><span class="xcd-info-icon">👤</span><span>' + escapeHtml(c.director) + '</span></div>';
                if (c.industry_detail && c.industry_detail !== c.industry_group) {
                    html += '<div class="xcd-info-row"><span class="xcd-info-icon">🏭</span><span>' + escapeHtml(c.industry_detail) + '</span></div>';
                }
                if (c.address) html += '<div class="xcd-info-row"><span class="xcd-info-icon">📍</span><span>' + escapeHtml(c.address) + '</span></div>';
                html += '</div>';

                // 연락처 바
                if (c.tel || c.homepage) {
                    html += '<div class="xcd-card-footer">';
                    if (c.tel) html += '<span class="xcd-contact-btn xcd-tel-btn">☎&nbsp;' + escapeHtml(c.tel) + '</span>';
                    if (c.homepage) html += '<a href="' + escapeHtml(c.homepage) + '" target="_blank" rel="noopener" class="xcd-contact-btn xcd-web-btn" onclick="event.stopPropagation()">🌐 홈페이지</a>';
                    html += '</div>';
                }

                html += '</div>';
                el.innerHTML = html;
                el.addEventListener('click', function() { openModal(c); });
                listEl.appendChild(el);
            });
            renderPagination(data.page, data.total_pages);
        }

        function renderPagination(page, total) {
            pagEl.innerHTML = '';
            if (total <= 1) return;
            var addBtn = function(p, label, disabled, current) {
                var b = document.createElement('button');
                b.textContent = label || p;
                b.className = 'xcd-pgbtn' + (current ? ' active' : '');
                if (disabled) b.disabled = true;
                b.addEventListener('click', function() {
                    state.page = p;
                    fetchData();
                    wrap.scrollIntoView({behavior:'smooth', block:'start'});
                });
                pagEl.appendChild(b);
            };
            addBtn(Math.max(1, page-1), '‹', page===1);
            var start = Math.max(1, page-3), end = Math.min(total, page+3);
            if (start > 1) { addBtn(1, '1', false); if (start > 2) pagEl.appendChild(document.createTextNode('...')); }
            for (var p = start; p <= end; p++) addBtn(p, String(p), false, p===page);
            if (end < total) { if (end < total-1) pagEl.appendChild(document.createTextNode('...')); addBtn(total, String(total), false); }
            addBtn(Math.min(total, page+1), '›', page===total);
        }

        function fetchData() {
            statusEl.textContent = '검색 중...';
            var fd = new FormData();
            fd.append('action', '<?php echo XCD_AJAX_ACTION; ?>');
            fd.append('search', state.search);
            fd.append('area', state.area);
            fd.append('group', state.group);
            fd.append('page', state.page);
            fd.append('per_page', perPage);
            fetch(ajaxurl, {method:'POST', body: fd, credentials:'same-origin'})
                .then(function(r){ return r.json(); })
                .then(function(j){
                    if (j.success) render(j.data);
                    else statusEl.textContent = '오류: ' + (j.data && j.data.message || '알 수 없음');
                })
                .catch(function(e){ statusEl.textContent = '네트워크 오류'; });
        }

        function debouncedFetch() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function() { state.page = 1; fetchData(); }, 300);
        }

        wrap.querySelector('.xcd-search').addEventListener('input', function(e) {
            state.search = e.target.value.trim();
            debouncedFetch();
        });
        wrap.querySelector('.xcd-area').addEventListener('change', function(e) {
            state.area = e.target.value; state.page = 1; fetchData();
        });
        wrap.querySelector('.xcd-group').addEventListener('change', function(e) {
            state.group = e.target.value; state.page = 1; fetchData();
        });
        wrap.querySelector('.xcd-reset').addEventListener('click', function() {
            wrap.querySelector('.xcd-search').value = '';
            wrap.querySelector('.xcd-area').value = '';
            wrap.querySelector('.xcd-group').value = '';
            state = {search:'', area:'', group:'', page:1};
            fetchData();
        });

        fetchData();
    })();
    </script>
    <?php
    return ob_get_clean();
}
add_shortcode('company_directory', 'xcd_directory_shortcode');

// ============================================================================
// AJAX 핸들러: 검색·필터·페이지네이션
// ============================================================================

function xcd_search_ajax() {
    global $wpdb;
    $table = $wpdb->prefix . XCD_TABLE;

    $search = isset($_POST['search']) ? trim(wp_unslash($_POST['search'])) : '';
    $area = isset($_POST['area']) ? trim(wp_unslash($_POST['area'])) : '';
    $group = isset($_POST['group']) ? trim(wp_unslash($_POST['group'])) : '';
    $page = max(1, intval($_POST['page'] ?? 1));
    $per_page = max(1, min(100, intval($_POST['per_page'] ?? XCD_PER_PAGE)));
    $offset = ($page - 1) * $per_page;

    $where = ['1=1'];
    $params = [];

    if ($area !== '') {
        $where[] = 'area = %s';
        $params[] = $area;
    }
    if ($group !== '') {
        $where[] = 'industry_group = %s';
        $params[] = $group;
    }
    if ($search !== '') {
        $where[] = 'search_text LIKE %s';
        $params[] = '%' . $wpdb->esc_like(strtolower($search)) . '%';
    }
    $where_sql = implode(' AND ', $where);

    // 총 카운트
    $count_sql = "SELECT COUNT(*) FROM $table WHERE $where_sql";
    $total = (int)$wpdb->get_var($params ? $wpdb->prepare($count_sql, $params) : $count_sql);

    // 데이터
    $data_sql = "SELECT id, company, director, industry_group, industry_detail, area, address, tel, homepage, email, source, source_url
                 FROM $table WHERE $where_sql
                 ORDER BY area ASC, company ASC
                 LIMIT %d OFFSET %d";
    $data_params = array_merge($params, [$per_page, $offset]);
    $items = $wpdb->get_results($wpdb->prepare($data_sql, $data_params));

    wp_send_json_success([
        'items' => $items,
        'total' => $total,
        'page' => $page,
        'total_pages' => max(1, (int)ceil($total / $per_page)),
        'per_page' => $per_page,
    ]);
}
add_action('wp_ajax_' . XCD_AJAX_ACTION, 'xcd_search_ajax');
add_action('wp_ajax_nopriv_' . XCD_AJAX_ACTION, 'xcd_search_ajax');

// ============================================================================
// 인라인 CSS (shortcode 첫 호출 시 출력)
// ============================================================================

function xcd_print_css() {
    ?>
    <style>
    /* ── 전체 래퍼 ── */
    .xcd-wrap {
        max-width: 1200px; margin: 0 auto; padding: 24px 16px;
        font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
        color: #1f2937;
    }

    /* ── 헤더 ── */
    .xcd-header {
        text-align: center;
        padding: 44px 24px 38px;
        margin-bottom: 28px;
        background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);
        border-radius: 16px;
        color: #fff;
        position: relative;
        overflow: hidden;
    }
    .xcd-header::before {
        content: '';
        position: absolute; top: -50px; right: -50px;
        width: 230px; height: 230px;
        background: rgba(255,255,255,0.1);
        border-radius: 50%; pointer-events: none;
    }
    .xcd-header::after {
        content: '';
        position: absolute; bottom: -65px; left: -40px;
        width: 270px; height: 270px;
        background: rgba(255,255,255,0.07);
        border-radius: 50%; pointer-events: none;
    }
    .xcd-title {
        font-size: 26px; font-weight: 800;
        margin: 0 0 10px; color: #fff;
        letter-spacing: -0.5px; position: relative; z-index: 1;
    }
    .xcd-subtitle {
        font-size: 15px; color: rgba(255,255,255,0.85);
        margin: 0; position: relative; z-index: 1;
    }
    .xcd-subtitle .xcd-total { color: #fff; font-size: 20px; font-weight: 800; }

    /* ── 필터 영역 ── */
    .xcd-filters {
        display: flex; flex-wrap: wrap; gap: 10px;
        margin-bottom: 20px; padding: 18px 20px;
        background: #fff4ec;
        border-radius: 12px;
        border: 1.5px solid #f5a87a;
        box-shadow: 0 2px 12px rgba(234,88,12,0.08);
    }
    .xcd-filters .xcd-search {
        flex: 1 1 260px; padding: 10px 16px;
        border: 1.5px solid #ea580c; border-radius: 8px;
        font-size: 15px; outline: none; color: #1f2937;
        background: #fff;
        transition: border-color 0.2s, box-shadow 0.2s;
    }
    .xcd-filters .xcd-search:focus {
        border-color: #c2410c;
        box-shadow: 0 0 0 3px rgba(234,88,12,0.15);
    }
    .xcd-filters select {
        padding: 10px 12px; border: 1.5px solid #d1d5db; border-radius: 8px;
        font-size: 14px; background: #fff; min-width: 140px;
        cursor: pointer; outline: none; color: #374151;
        transition: border-color 0.2s;
    }
    .xcd-filters select:focus { border-color: #1b2a4a; }
    .xcd-filters .xcd-reset {
        padding: 10px 18px; border: 1.5px solid #d1d5db; background: #fff;
        border-radius: 8px; cursor: pointer; font-size: 14px; color: #6b7280;
        transition: background 0.15s, border-color 0.15s;
    }
    .xcd-filters .xcd-reset:hover { background: #f9fafb; border-color: #9ca3af; color: #374151; }

    /* ── 결과 상태 ── */
    .xcd-status { padding: 4px 2px 18px; color: #6b7280; font-size: 14px; font-weight: 500; }

    /* ── 카드 그리드 ── */
    .xcd-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }

    /* ── 카드 ── */
    .xcd-card {
        background: #fdf9f5;
        border: 1px solid #e8ecf2;
        border-left: 4px solid #c9a227;
        border-radius: 12px;
        overflow: hidden;
        cursor: pointer;
        display: flex; flex-direction: column;
        transition: box-shadow 0.22s, transform 0.22s, border-left-color 0.22s;
    }
    .xcd-card:hover {
        box-shadow: 0 10px 36px rgba(27,42,74,0.14);
        transform: translateY(-4px);
        border-left-color: #1b2a4a;
    }
    .xcd-card-inner {
        padding: 20px 22px 16px;
        display: flex; flex-direction: column; height: 100%;
    }
    .xcd-card-head { margin-bottom: 12px; }
    .xcd-card-name {
        font-size: 19px; font-weight: 700;
        color: #111; margin: 0 0 9px;
        line-height: 1.35; letter-spacing: -0.3px;
    }
    .xcd-card-tags { display: flex; flex-wrap: wrap; gap: 6px; }
    .xcd-chip-area {
        background: #1b2a4a; color: #fff;
        padding: 3px 11px; border-radius: 20px;
        font-size: 13px; font-weight: 600;
        white-space: nowrap; letter-spacing: 0.3px;
    }
    .xcd-chip-industry {
        background: #fdf7e3; color: #92660a;
        padding: 3px 11px; border-radius: 20px;
        font-size: 13px; font-weight: 600;
        white-space: nowrap; border: 1px solid #f0d98a;
    }
    .xcd-card-info { flex: 1; }
    .xcd-info-row {
        display: flex; align-items: flex-start; gap: 7px;
        font-size: 15px; color: #111827;
        margin-bottom: 5px; line-height: 1.55;
    }
    .xcd-info-icon { font-size: 13px; flex-shrink: 0; width: 17px; text-align: center; margin-top: 1px; }
    .xcd-card-footer {
        margin-top: 14px; padding-top: 12px;
        border-top: 1px solid #f0f3f7;
        display: flex; flex-wrap: wrap; gap: 8px;
    }
    .xcd-contact-btn {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 5px 12px; border-radius: 6px;
        font-size: 12px; font-weight: 500;
        background: #f8fafc; border: 1px solid #e5e7eb;
        color: #475569; text-decoration: none; pointer-events: none;
    }
    .xcd-contact-btn.xcd-tel-btn { color: #1b2a4a; border-color: #ccd5e5; background: #f4f6fa; }
    .xcd-contact-btn.xcd-web-btn {
        color: #92660a; border-color: #f0d98a;
        background: #fdf7e3; pointer-events: all;
    }
    .xcd-contact-btn.xcd-web-btn:hover { background: #fef3c7; }

    /* ── 모달 오버레이 ── */
    .xcd-overlay {
        display: none; position: fixed; inset: 0;
        background: rgba(10,20,50,0.65); z-index: 99999;
        align-items: center; justify-content: center; padding: 16px;
        backdrop-filter: blur(3px);
    }
    .xcd-overlay.open { display: flex; }

    /* ── 모달 본체 ── */
    .xcd-modal {
        background: #fff; border-radius: 20px;
        max-width: 580px; width: 100%; max-height: 90vh;
        overflow-y: auto; position: relative;
        box-shadow: 0 28px 90px rgba(10,20,50,0.38);
    }
    .xcd-modal-hd {
        background: linear-gradient(135deg, #1b2a4a 0%, #2c3f6e 100%);
        padding: 28px 28px 22px;
        border-radius: 20px 20px 0 0;
        position: relative;
    }
    .xcd-modal-close {
        position: absolute; top: 14px; right: 16px;
        background: rgba(255,255,255,0.14); border: none;
        color: rgba(255,255,255,0.85); border-radius: 50%;
        width: 32px; height: 32px; font-size: 18px;
        cursor: pointer; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
    }
    .xcd-modal-close:hover { background: rgba(255,255,255,0.26); color: #fff; }
    .xcd-modal-title {
        font-size: 21px; font-weight: 800;
        color: #fff; margin: 0 40px 10px 0;
        line-height: 1.35; letter-spacing: -0.3px;
    }
    .xcd-modal-area {
        display: inline-block;
        background: rgba(201,162,39,0.22); color: #f5d060;
        padding: 3px 12px; border-radius: 20px;
        font-size: 12px; font-weight: 600;
        border: 1px solid rgba(201,162,39,0.38);
    }
    .xcd-modal-body { padding: 24px 28px 28px; }
    .xcd-modal-row {
        display: flex; gap: 12px;
        padding: 11px 0; font-size: 14px; color: #374151;
        border-bottom: 1px solid #f3f4f6;
    }
    .xcd-modal-row:last-child { border-bottom: none; }
    .xcd-modal-label {
        min-width: 56px; color: #9ca3af; font-weight: 600;
        font-size: 11px; padding-top: 3px;
        text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0;
    }
    .xcd-modal-val { flex: 1; line-height: 1.65; color: #1f2937; }
    .xcd-modal-val a { color: #c9a227; text-decoration: none; word-break: break-all; }
    .xcd-modal-val a:hover { text-decoration: underline; }
    .xcd-modal-val a[href^="mailto"] { color: #111827; }

    /* ── 페이지네이션 ── */
    .xcd-pagination {
        display: flex; flex-wrap: wrap; justify-content: center;
        gap: 4px; margin-top: 32px; padding: 12px 0;
    }
    .xcd-pgbtn {
        min-width: 36px; padding: 7px 10px;
        border: 1px solid #d1d5db; background: #fff;
        border-radius: 6px; cursor: pointer;
        font-size: 14px; color: #374151;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
    }
    .xcd-pgbtn:hover:not(:disabled) { background: #f0f4ff; border-color: #1b2a4a; color: #1b2a4a; }
    .xcd-pgbtn.active { background: #1b2a4a; color: #fff; border-color: #1b2a4a; font-weight: 700; }
    .xcd-pgbtn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* ── 반응형 ── */
    @media (max-width: 640px) {
        .xcd-title { font-size: 21px; }
        .xcd-header { padding: 28px 20px 24px; }
        .xcd-filters { padding: 14px; }
        .xcd-filters select { min-width: 0; flex: 1; }
        .xcd-list { grid-template-columns: 1fr; }
        .xcd-modal-hd { padding: 20px 20px 16px; }
        .xcd-modal-title { font-size: 17px; }
        .xcd-modal-body { padding: 18px 20px 22px; }
    }
    </style>
    <?php
}
