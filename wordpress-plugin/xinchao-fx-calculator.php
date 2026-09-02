<?php
/**
 * Plugin Name: Xinchao FX Calculator
 * Description: 베트남 동(VND) 환율 계산기 — [fx_calculator] shortcode. 원·달러·엔 ↔ 동 실시간 환산 + 지폐 단위 환산표 + 암산 요령. 환율은 서버에서 1시간 캐시(transient)하므로 HTML 에 실제 숫자가 박혀 검색 노출에 유리하다.
 * Version: 1.0.0
 * Author: Xinchao News
 * Text Domain: xinchao-fx
 *
 * 왜 만들었나 (2026-09-02):
 *   ① 시장은 크다 — 네이버 검색광고 실측으로 환율·환전·베트남동 계열은 **월 116만 검색**.
 *      키워드 16개가 베트남 관련 한국어 검색 전체의 26% 를 차지한다.
 *   ② 그런데 우리 몫은 0 에 가깝다 — 서치콘솔 28일 실측에서 '환율' 계열 노출 6,393회 중
 *      **96% 가 단 3일에 몰려 있다.** 예: '달러 환율' 3,465회는 기사 하나(168780)가
 *      8/15~8/16 이틀 뜬 게 전부고, 나머지 27일은 노출 0 이다.
 *      = 상시 순위가 아니라 **뉴스 반짝 노출**이었다. 이 시장에서 우리 자산은 없다.
 *   ⇒ 그래서 '계속 남는 페이지'가 필요하다. 뉴스 기사는 이틀이면 사라지지만
 *      계산기 페이지는 계속 걸린다. 없던 자리를 새로 만드는 것이지,
 *      기존 순위를 클릭으로 바꾸는 작업이 아니다. (초판 주석의 판단 오류를 정정함)
 *
 *   왜 chaovietnam.co.kr 인가: 우리 도메인 중 검색 노출이 가장 크고(월 26만) 업력이 길다.
 *   '환율로 이미 4위라서'가 아니다 — 그건 위와 같이 사실이 아니었다.
 *
 * 설치:
 *   1. 이 파일을 /wp-content/plugins/xinchao-fx-calculator.php 에 FTP 업로드
 *   2. WP 관리자 → 플러그인 → "Xinchao FX Calculator" 활성화
 *   3. 새 페이지 생성(권장 슬러그: /exchange-rate) → 본문에 [fx_calculator] 삽입
 *
 * 환율 출처: open.er-api.com (무료·키 불필요). lib/external-data.js 와 같은 소스라
 *           사이트·앱·뉴스가 같은 값을 쓴다.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('XCFX_VERSION', '1.0.0');
define('XCFX_TRANSIENT', 'xcfx_rates_v1');
define('XCFX_TTL', HOUR_IN_SECONDS);

/**
 * 환율을 가져온다. 1시간 transient 캐시.
 *
 * open.er-api.com 은 USD 기준 전 통화 환율을 한 번에 준다. 교차환율은 여기서 계산한다
 * (예: 1원 = rates.VND / rates.KRW 동). 호출 1회로 원·달러·엔을 모두 처리한다.
 *
 * @return array{usdVnd:float,krwVnd:float,jpyVnd:float,usdKrw:float,updated:int,stale:bool}
 */
function xcfx_get_rates() {
    $cached = get_transient(XCFX_TRANSIENT);
    if (is_array($cached)) {
        return $cached;
    }

    // 폴백 — API 가 죽어도 페이지는 뜨게 한다. stale 표시로 정직하게 알린다.
    $rates = array(
        'usdVnd'  => 26000.0,
        'krwVnd'  => 18.5,
        'jpyVnd'  => 170.0,
        'usdKrw'  => 1390.0,
        'updated' => time(),
        'stale'   => true,
    );

    $res = wp_remote_get('https://open.er-api.com/v6/latest/USD', array('timeout' => 8));
    if (!is_wp_error($res) && 200 === wp_remote_retrieve_response_code($res)) {
        $body = json_decode(wp_remote_retrieve_body($res), true);
        if (!empty($body['rates']['VND']) && !empty($body['rates']['KRW'])) {
            $vnd = (float) $body['rates']['VND'];
            $krw = (float) $body['rates']['KRW'];
            $jpy = !empty($body['rates']['JPY']) ? (float) $body['rates']['JPY'] : 0.0;
            $rates = array(
                'usdVnd'  => $vnd,
                'krwVnd'  => $vnd / $krw,
                'jpyVnd'  => $jpy > 0 ? $vnd / $jpy : 170.0,   // JPY 누락 시 계산기가 죽지 않게
                'usdKrw'  => $krw,
                'updated' => !empty($body['time_last_update_unix'])
                    ? (int) $body['time_last_update_unix'] : time(),
                'stale'   => false,
            );
            set_transient(XCFX_TRANSIENT, $rates, XCFX_TTL);
        }
    }

    return $rates;
}

/** 숫자 포맷 — 자릿수는 통화 성격에 맞춘다 (동은 소수점 무의미, 원은 소수 1자리) */
function xcfx_fmt($n, $dec = 0) {
    return number_format((float) $n, $dec);
}

/**
 * [fx_calculator] — 계산기 + 지폐 환산표 + 암산 요령
 */
function xcfx_shortcode($atts) {
    $r = xcfx_get_rates();

    // 지폐 환산표: 베트남에서 실제로 쓰는 지폐·동전 단위.
    // 여행자가 계산기보다 이 표를 더 많이 본다 — 지갑에서 꺼낸 지폐가 얼마인지가 궁금하기 때문.
    $notes = array(1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000);

    $krw_per_vnd = $r['krwVnd'] > 0 ? 1 / $r['krwVnd'] : 0;   // 1동이 몇 원인가
    $updated_kst = wp_date('Y년 n월 j일 G:i', $r['updated']);

    ob_start();
    ?>
    <div class="xcfx" data-usdvnd="<?php echo esc_attr($r['usdVnd']); ?>"
         data-krwvnd="<?php echo esc_attr($r['krwVnd']); ?>"
         data-jpyvnd="<?php echo esc_attr($r['jpyVnd']); ?>"
         data-usdkrw="<?php echo esc_attr($r['usdKrw']); ?>">

        <!-- 오늘의 환율 요약: 검색 결과 스니펫에 잡히도록 텍스트로 박아둔다 -->
        <div class="xcfx-head">
            <div class="xcfx-lead">
                <strong>1,000동</strong> = 약 <strong><?php echo esc_html(xcfx_fmt($krw_per_vnd * 1000, 1)); ?>원</strong>
                &nbsp;·&nbsp;
                <strong>1달러</strong> = <strong><?php echo esc_html(xcfx_fmt($r['usdVnd'])); ?>동</strong>
            </div>
            <div class="xcfx-updated">
                <?php echo esc_html($updated_kst); ?> 기준
                <?php if (!empty($r['stale'])) : ?>
                    <span class="xcfx-stale">· 실시간 조회 실패, 참고용 값</span>
                <?php endif; ?>
            </div>
        </div>

        <!-- 계산기 -->
        <div class="xcfx-calc">
            <div class="xcfx-field">
                <label for="xcfx-a">보낼 금액</label>
                <div class="xcfx-input">
                    <input type="text" id="xcfx-a" inputmode="decimal" value="10,000" autocomplete="off">
                    <select id="xcfx-ca" aria-label="원래 통화">
                        <option value="KRW" selected>원 (KRW)</option>
                        <option value="VND">동 (VND)</option>
                        <option value="USD">달러 (USD)</option>
                        <option value="JPY">엔 (JPY)</option>
                    </select>
                </div>
            </div>

            <button type="button" class="xcfx-swap" id="xcfx-swap" aria-label="통화 바꾸기">⇅</button>

            <div class="xcfx-field">
                <label for="xcfx-b">받을 금액</label>
                <div class="xcfx-input">
                    <input type="text" id="xcfx-b" inputmode="decimal" value="" autocomplete="off">
                    <select id="xcfx-cb" aria-label="바꿀 통화">
                        <option value="KRW">원 (KRW)</option>
                        <option value="VND" selected>동 (VND)</option>
                        <option value="USD">달러 (USD)</option>
                        <option value="JPY">엔 (JPY)</option>
                    </select>
                </div>
            </div>
        </div>
        <p class="xcfx-rate-line" id="xcfx-rate"></p>

        <!-- 지폐 환산표 -->
        <h3 class="xcfx-h3">베트남 지폐, 한국 돈으로 얼마?</h3>
        <div class="xcfx-tbl-wrap">
            <table class="xcfx-tbl">
                <thead><tr><th>베트남 동</th><th>한국 원</th><th>미국 달러</th></tr></thead>
                <tbody>
                <?php foreach ($notes as $v) : ?>
                    <tr>
                        <td class="xcfx-vnd"><?php echo esc_html(xcfx_fmt($v)); ?>đ</td>
                        <td><?php echo esc_html(xcfx_fmt($krw_per_vnd * $v, $v < 10000 ? 1 : 0)); ?>원</td>
                        <td>$<?php echo esc_html(xcfx_fmt($v / $r['usdVnd'], 2)); ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <!-- 암산 요령 — 현지에 사는 사람만 쓸 수 있는 실전 정보 -->
        <h3 class="xcfx-h3">계산기 없이 암산하는 법</h3>
        <div class="xcfx-tip">
            <p><strong>동 → 원 : 0을 하나 지우고 반으로 나눈다.</strong><br>
                예를 들어 <b>100,000동</b>이면 0을 하나 지워 10,000, 반으로 나누면 <b>5,000원</b>.
                실제로는 <?php echo esc_html(xcfx_fmt($krw_per_vnd * 100000)); ?>원이니
                시장에서 값을 가늠하기엔 충분합니다.</p>
            <p><strong>원 → 동 : 2를 곱하고 0을 하나 붙인다.</strong><br>
                <b>3만원</b>이면 6만에 0 하나 붙여 <b>60만동</b>.
                (실제 <?php echo esc_html(xcfx_fmt(30000 / $krw_per_vnd)); ?>동)</p>
            <p class="xcfx-warn"><strong>주의 — 0의 개수를 세십시오.</strong>
                베트남 지폐는 20,000동(파란색)과 500,000동(하늘색)이 색이 비슷해
                한국 사람이 가장 많이 실수하는 조합입니다. 계산 전에 0이 몇 개인지부터 보세요.</p>
        </div>

        <p class="xcfx-foot">
            환율은 매시간 갱신되는 국제 기준 환율입니다. 은행·환전소·카드사는 여기에 수수료가 붙어
            실제 받는 금액은 조금 달라집니다.
        </p>
    </div>

    <style>
    .xcfx{--fx-line:#e2e5e9;--fx-ink:#1a1f26;--fx-ink2:#5b6572;--fx-accent:#0d6b58;
        --fx-bg:#f6f8f7;max-width:720px;margin:0 auto;color:var(--fx-ink);
        font-size:16px;line-height:1.7}
    .xcfx *{box-sizing:border-box}
    .xcfx-head{border:1px solid var(--fx-line);border-left:4px solid var(--fx-accent);
        border-radius:0 6px 6px 0;padding:16px 18px;background:var(--fx-bg);margin-bottom:20px}
    .xcfx-lead{font-size:18px;line-height:1.6}
    .xcfx-lead strong{color:var(--fx-accent)}
    .xcfx-updated{font-size:13px;color:var(--fx-ink2);margin-top:4px}
    .xcfx-stale{color:#a6382a}
    .xcfx-calc{display:flex;flex-direction:column;gap:8px;align-items:stretch}
    .xcfx-field label{display:block;font-size:13px;color:var(--fx-ink2);margin-bottom:5px}
    .xcfx-input{display:flex;gap:8px}
    .xcfx-input input{flex:1;min-width:0;font-size:22px;font-weight:600;padding:12px 14px;
        border:1px solid var(--fx-line);border-radius:6px;background:#fff;color:var(--fx-ink);
        text-align:right;font-variant-numeric:tabular-nums;width:100%}
    .xcfx-input input:focus{outline:2px solid var(--fx-accent);outline-offset:1px}
    .xcfx-input select{font-size:15px;padding:0 10px;border:1px solid var(--fx-line);
        border-radius:6px;background:#fff;color:var(--fx-ink);min-width:118px}
    .xcfx-swap{align-self:center;width:38px;height:38px;border-radius:50%;
        border:1px solid var(--fx-line);background:#fff;color:var(--fx-accent);
        font-size:17px;cursor:pointer;line-height:1;margin:2px 0}
    .xcfx-swap:hover{background:var(--fx-bg)}
    .xcfx-rate-line{font-size:14px;color:var(--fx-ink2);text-align:center;margin:12px 0 4px}
    .xcfx-h3{font-size:19px;margin:34px 0 12px;padding-bottom:8px;
        border-bottom:1px solid var(--fx-line)}
    .xcfx-tbl-wrap{overflow-x:auto}
    .xcfx-tbl{width:100%;border-collapse:collapse;font-size:15px}
    .xcfx-tbl th{text-align:right;font-size:13px;color:var(--fx-ink2);font-weight:500;
        padding:9px 12px;border-bottom:1px solid var(--fx-line);background:var(--fx-bg)}
    .xcfx-tbl th:first-child{text-align:left}
    .xcfx-tbl td{text-align:right;padding:9px 12px;border-bottom:1px solid var(--fx-line);
        font-variant-numeric:tabular-nums}
    .xcfx-tbl td.xcfx-vnd{text-align:left;font-weight:600}
    .xcfx-tbl tr:last-child td{border-bottom:none}
    .xcfx-tip p{margin:0 0 14px}
    .xcfx-tip b{color:var(--fx-accent)}
    .xcfx-warn{background:var(--fx-bg);border-radius:6px;padding:13px 15px;font-size:15px}
    .xcfx-foot{font-size:13px;color:var(--fx-ink2);margin-top:26px;padding-top:14px;
        border-top:1px solid var(--fx-line)}
    @media(max-width:560px){
        .xcfx-input input{font-size:19px}
        .xcfx-input select{min-width:100px;font-size:14px}
    }
    </style>

    <script>
    (function () {
        // 이 <script> 는 .xcfx 다음에 오는 *형제* 라 closest() 로는 못 찾는다.
        // 파싱 시점 기준 마지막 .xcfx 가 방금 그려진 우리 것이다 (여러 개 삽입해도 안전).
        var all = document.querySelectorAll('.xcfx');
        var box = all[all.length - 1];
        if (!box) return;

        // USD 기준 환율에서 모든 교차환율을 만든다 (1 USD = R[통화])
        var R = {
            USD: 1,
            VND: parseFloat(box.dataset.usdvnd),
            KRW: parseFloat(box.dataset.usdkrw),
            JPY: parseFloat(box.dataset.usdkrw) && parseFloat(box.dataset.jpyvnd)
                 ? parseFloat(box.dataset.usdvnd) / parseFloat(box.dataset.jpyvnd) : 0
        };
        var DEC = { VND: 0, KRW: 0, USD: 2, JPY: 0 };
        var NAME = { VND: '동', KRW: '원', USD: '달러', JPY: '엔' };

        var a = box.querySelector('#xcfx-a'), b = box.querySelector('#xcfx-b'),
            ca = box.querySelector('#xcfx-ca'), cb = box.querySelector('#xcfx-cb'),
            rateLine = box.querySelector('#xcfx-rate');

        function parseNum(s) {
            var n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
            return isFinite(n) ? n : 0;
        }
        function fmt(n, cur) {
            var d = DEC[cur];
            return n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
        }
        function convert(v, from, to) {
            if (!R[from] || !R[to]) return 0;
            return v / R[from] * R[to];   // from → USD → to
        }
        function showRate() {
            var one = convert(1, ca.value, cb.value);
            if (!one) { rateLine.textContent = ''; return; }
            var d = one >= 100 ? 0 : one >= 1 ? 2 : 4;
            rateLine.textContent = '1' + NAME[ca.value] + ' = ' +
                one.toLocaleString('ko-KR',
                    { minimumFractionDigits: d, maximumFractionDigits: d }) + NAME[cb.value];
        }
        // side: 어느 칸을 사람이 쳤는가 → 반대쪽을 계산한다
        function sync(side) {
            if (side === 'a') {
                b.value = fmt(convert(parseNum(a.value), ca.value, cb.value), cb.value);
            } else {
                a.value = fmt(convert(parseNum(b.value), cb.value, ca.value), ca.value);
            }
            showRate();
        }

        a.addEventListener('input', function () { sync('a'); });
        b.addEventListener('input', function () { sync('b'); });
        ca.addEventListener('change', function () { sync('a'); });
        cb.addEventListener('change', function () { sync('a'); });
        box.querySelector('#xcfx-swap').addEventListener('click', function () {
            var t = ca.value; ca.value = cb.value; cb.value = t;
            var tv = a.value; a.value = b.value; b.value = tv;
            sync('a');
        });

        sync('a');
    })();
    </script>
    <?php
    return ob_get_clean();
}
add_shortcode('fx_calculator', 'xcfx_shortcode');

/**
 * 환율이 바뀌면 캐시를 비우는 수동 훅 (관리자 → 도구 에서 쓸 일 있을 때).
 * 별도 UI 는 만들지 않는다 — 1시간 캐시라 보통 필요 없다.
 */
function xcfx_flush_cache() {
    delete_transient(XCFX_TRANSIENT);
}
