<?php
/**
 * Plugin Name: Xinchao FX Calculator
 * Description: 베트남 동(VND) 환율 계산기 — [fx_calculator] shortcode. 원·달러·엔 ↔ 동 실시간 환산 + 지폐 단위 환산표 + 암산 요령. 환율은 서버에서 1시간 캐시(transient)하므로 HTML 에 실제 숫자가 박혀 검색 노출에 유리하다.
 * Version: 1.1.1
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
 *
 * v1.1.0 (2026-09-02) — 화면 개편. 사장님 지적: "너무 건조하다".
 *   · 씬짜오 브랜드 색 적용 — 로고에서 뽑은 오렌지 #FF6F02 / 짙은 적갈 #9C220A
 *   · 로고 + 「씬짜오 베트남 환율계산기」 머리말
 *   · 보낼 금액=흰 카드(입력) / 받을 금액=오렌지 카드(결과) 로 배경을 갈라
 *     어느 쪽이 결과인지 눈으로 구분되게 함
 *   로고는 서버에 이미 있는 파일을 쓴다(중복 업로드 안 함):
 *   wp-content/uploads/2025/06/xinchao-logo.png
 *
 * v1.1.1 (2026-09-02) — 사장님 지적 2건
 *   · "보낼 금액/받을 금액" 은 송금처럼 읽힌다 → 「금액 입력」/「환산 결과」
 *   · 10,000 이 값으로 박혀 진했다 → placeholder 로 옮기고 흐리게(opacity .5).
 *     입력이 비면 반대쪽도 비우도록 JS 보강 — 안 그러면 '0' 이 남는다.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('XCFX_VERSION', '1.1.1');
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

        <!-- 머리말: 로고 + 제목 -->
        <div class="xcfx-brand">
            <img class="xcfx-logo" width="46" height="46" loading="lazy"
                 src="https://chaovietnam.co.kr/wp-content/uploads/2025/06/xinchao-logo.png"
                 alt="씬짜오베트남">
            <div class="xcfx-brand-txt">
                <h2 class="xcfx-title">씬짜오 베트남 환율계산기</h2>
                <p class="xcfx-sub">원 · 달러 · 엔 ↔ 베트남 동(VND) 실시간 환산</p>
            </div>
        </div>

        <!-- 오늘의 환율: 검색 스니펫에 잡히도록 텍스트로 박아둔다 -->
        <div class="xcfx-head">
            <div class="xcfx-rates">
                <div class="xcfx-rate-item">
                    <span class="k">1,000동</span>
                    <span class="v"><?php echo esc_html(xcfx_fmt($krw_per_vnd * 1000, 1)); ?><i>원</i></span>
                </div>
                <div class="xcfx-rate-item">
                    <span class="k">1,000원</span>
                    <span class="v"><?php echo esc_html(xcfx_fmt($r['krwVnd'] * 1000)); ?><i>동</i></span>
                </div>
                <div class="xcfx-rate-item">
                    <span class="k">1달러</span>
                    <span class="v"><?php echo esc_html(xcfx_fmt($r['usdVnd'])); ?><i>동</i></span>
                </div>
            </div>
            <div class="xcfx-updated">
                <?php echo esc_html($updated_kst); ?> 기준
                <?php if (!empty($r['stale'])) : ?>
                    <span class="xcfx-stale">· 실시간 조회 실패, 참고용 값</span>
                <?php endif; ?>
            </div>
        </div>

        <!-- 계산기: 입력=흰 카드 / 결과=오렌지 카드 -->
        <div class="xcfx-calc">
            <div class="xcfx-field xcfx-from">
                <label for="xcfx-a"><span class="xcfx-dot"></span>금액 입력</label>
                <div class="xcfx-input">
                    <input type="text" id="xcfx-a" inputmode="decimal" value=""
                           placeholder="10,000" autocomplete="off">
                    <select id="xcfx-ca" aria-label="원래 통화">
                        <option value="KRW" selected>원 KRW</option>
                        <option value="VND">동 VND</option>
                        <option value="USD">달러 USD</option>
                        <option value="JPY">엔 JPY</option>
                    </select>
                </div>
            </div>

            <button type="button" class="xcfx-swap" id="xcfx-swap" aria-label="통화 바꾸기">⇅</button>

            <div class="xcfx-field xcfx-to">
                <label for="xcfx-b"><span class="xcfx-dot"></span>환산 결과</label>
                <div class="xcfx-input">
                    <input type="text" id="xcfx-b" inputmode="decimal" value=""
                           placeholder="자동 계산" autocomplete="off">
                    <select id="xcfx-cb" aria-label="바꿀 통화">
                        <option value="KRW">원 KRW</option>
                        <option value="VND" selected>동 VND</option>
                        <option value="USD">달러 USD</option>
                        <option value="JPY">엔 JPY</option>
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
                        <td class="xcfx-vnd"><?php echo esc_html(xcfx_fmt($v)); ?><i>đ</i></td>
                        <td><?php echo esc_html(xcfx_fmt($krw_per_vnd * $v, $v < 10000 ? 1 : 0)); ?><i>원</i></td>
                        <td>$<?php echo esc_html(xcfx_fmt($v / $r['usdVnd'], 2)); ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>

        <!-- 암산 요령 — 현지에 사는 사람만 쓸 수 있는 실전 정보 -->
        <h3 class="xcfx-h3">계산기 없이 암산하는 법</h3>
        <div class="xcfx-tips">
            <div class="xcfx-tip">
                <div class="xcfx-tip-h">동 → 원</div>
                <p><b>0을 하나 지우고 반으로 나눈다.</b><br>
                   <b>100,000동</b> → 0 하나 지워 10,000 → 반으로 나누면 <b>5,000원</b>.
                   실제로는 <?php echo esc_html(xcfx_fmt($krw_per_vnd * 100000)); ?>원이니
                   시장에서 값을 가늠하기엔 충분합니다.</p>
            </div>
            <div class="xcfx-tip">
                <div class="xcfx-tip-h">원 → 동</div>
                <p><b>2를 곱하고 0을 하나 붙인다.</b><br>
                   <b>3만원</b> → 6만 → 0 하나 붙여 <b>60만동</b>.
                   (실제 <?php echo esc_html(xcfx_fmt(30000 / $krw_per_vnd)); ?>동)</p>
            </div>
        </div>
        <div class="xcfx-warn">
            <strong>0의 개수를 세십시오.</strong>
            베트남 지폐는 <b>20,000동</b>(파란색)과 <b>500,000동</b>(하늘색)이 색이 비슷해
            한국 사람이 가장 많이 실수하는 조합입니다. 계산 전에 0이 몇 개인지부터 보세요.
        </div>

        <p class="xcfx-foot">
            환율은 매시간 갱신되는 국제 기준 환율입니다. 은행·환전소·카드사는 여기에 수수료가 붙어
            실제 받는 금액은 조금 달라집니다.
        </p>
    </div>

    <style>
    /* 씬짜오 브랜드 색 — 로고에서 뽑음 (오렌지 #FF6F02 / 짙은 적갈 #9C220A / 흰색) */
    .xcfx{
        --fx-brand:#FF6F02; --fx-brand-dk:#E05F00; --fx-deep:#9C220A;
        --fx-tint:#FFF3E8; --fx-tint-line:#FFD3AC;
        --fx-ink:#241A14; --fx-ink2:#6E5D53; --fx-ink3:#9C8B80;
        --fx-surface:#FFFFFF; --fx-ground:#FCF8F5; --fx-line:#EDE2DA;
        max-width:760px;margin:0 auto;color:var(--fx-ink);
        font-size:16px;line-height:1.7;text-align:left;
    }
    .xcfx *{box-sizing:border-box}
    .xcfx i{font-style:normal}

    /* 머리말 */
    .xcfx-brand{display:flex;align-items:center;gap:14px;
        padding-bottom:16px;border-bottom:3px solid var(--fx-brand);margin-bottom:22px}
    .xcfx-logo{width:46px;height:46px;border-radius:9px;flex:none;display:block}
    .xcfx-brand-txt{min-width:0}
    .xcfx-title{margin:0;font-size:23px;font-weight:800;line-height:1.25;
        letter-spacing:-.02em;color:var(--fx-ink)}
    .xcfx-sub{margin:3px 0 0;font-size:13.5px;color:var(--fx-ink2)}

    /* 오늘의 환율 배너 */
    .xcfx-head{background:linear-gradient(135deg,var(--fx-brand) 0%,var(--fx-brand-dk) 62%,var(--fx-deep) 100%);
        border-radius:12px;padding:18px 20px 14px;margin-bottom:22px;color:#fff}
    .xcfx-rates{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .xcfx-rate-item{display:flex;flex-direction:column;gap:2px;min-width:0;
        padding-left:13px;border-left:1px solid rgba(255,255,255,.34)}
    .xcfx-rate-item:first-child{padding-left:0;border-left:0}
    .xcfx-rate-item .k{font-size:12.5px;color:rgba(255,255,255,.88);white-space:nowrap}
    .xcfx-rate-item .v{font-size:21px;font-weight:700;line-height:1.15;
        letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .xcfx-rate-item .v i{font-size:13px;font-weight:500;margin-left:2px;opacity:.9}
    .xcfx-updated{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.26);
        font-size:12px;color:rgba(255,255,255,.9)}
    .xcfx-stale{color:#FFE0D6;font-weight:600}

    /* 계산기 */
    .xcfx-calc{display:flex;flex-direction:column;align-items:stretch;gap:0}
    .xcfx-field{border-radius:12px;padding:14px 16px 16px;border:1px solid var(--fx-line)}
    .xcfx-from{background:var(--fx-surface)}
    .xcfx-to{background:var(--fx-tint);border-color:var(--fx-tint-line)}
    .xcfx-field label{display:flex;align-items:center;gap:7px;
        font-size:13px;font-weight:600;color:var(--fx-ink2);margin-bottom:8px}
    .xcfx-dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
    .xcfx-from .xcfx-dot{background:var(--fx-ink3)}
    .xcfx-to .xcfx-dot{background:var(--fx-brand)}
    .xcfx-to label{color:var(--fx-deep)}
    .xcfx-input{display:flex;gap:9px}
    .xcfx-input input{flex:1;min-width:0;width:100%;font-size:24px;font-weight:700;
        padding:11px 14px;border:1px solid var(--fx-line);border-radius:9px;
        background:#fff;color:var(--fx-ink);text-align:right;
        font-variant-numeric:tabular-nums;line-height:1.3;-webkit-appearance:none}
    .xcfx-to .xcfx-input input{border-color:var(--fx-tint-line);color:var(--fx-deep)}
    /* placeholder 는 눈에 띄게 흐려야 "예시"로 읽힌다 — 값과 같은 농도면 지울 생각을 안 한다 */
    .xcfx-input input::placeholder{color:var(--fx-ink3);opacity:.5;font-weight:400}
    .xcfx-to .xcfx-input input::placeholder{color:#C89A76;opacity:.75;font-weight:400}
    .xcfx-input input:focus{outline:2px solid var(--fx-brand);outline-offset:1px;border-color:transparent}
    .xcfx-input input:focus::placeholder{opacity:.3}
    .xcfx-input select{font-size:14.5px;font-weight:600;padding:0 10px;
        border:1px solid var(--fx-line);border-radius:9px;background:#fff;
        color:var(--fx-ink);min-width:112px;-webkit-appearance:menulist}
    .xcfx-input select:focus{outline:2px solid var(--fx-brand);outline-offset:1px}
    .xcfx-swap{align-self:center;width:42px;height:42px;border-radius:50%;
        border:2px solid #fff;background:var(--fx-brand);color:#fff;
        font-size:19px;line-height:1;cursor:pointer;margin:-9px 0;z-index:2;position:relative;
        box-shadow:0 2px 8px rgba(255,111,2,.34)}
    .xcfx-swap:hover{background:var(--fx-brand-dk)}
    .xcfx-swap:focus-visible{outline:2px solid var(--fx-deep);outline-offset:2px}
    .xcfx-rate-line{font-size:14px;color:var(--fx-ink2);text-align:center;
        margin:14px 0 0;font-variant-numeric:tabular-nums}

    /* 소제목 */
    .xcfx-h3{font-size:19px;font-weight:700;margin:34px 0 14px;padding-left:12px;
        border-left:4px solid var(--fx-brand);line-height:1.35;color:var(--fx-ink)}

    /* 지폐 환산표 */
    .xcfx-tbl-wrap{overflow-x:auto;border:1px solid var(--fx-line);border-radius:11px}
    .xcfx-tbl{width:100%;border-collapse:collapse;font-size:15px;background:#fff}
    .xcfx-tbl th{text-align:right;font-size:12.5px;font-weight:600;padding:11px 14px;
        background:var(--fx-brand);color:#fff;white-space:nowrap}
    .xcfx-tbl th:first-child{text-align:left}
    .xcfx-tbl td{text-align:right;padding:10px 14px;border-top:1px solid var(--fx-line);
        font-variant-numeric:tabular-nums;white-space:nowrap}
    .xcfx-tbl tbody tr:nth-child(even){background:var(--fx-ground)}
    .xcfx-tbl td.xcfx-vnd{text-align:left;font-weight:700;color:var(--fx-deep)}
    .xcfx-tbl td i{color:var(--fx-ink3);font-size:12.5px;margin-left:2px}

    /* 암산 요령 */
    .xcfx-tips{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .xcfx-tip{background:var(--fx-ground);border:1px solid var(--fx-line);
        border-radius:11px;padding:16px 18px}
    .xcfx-tip-h{display:inline-block;font-size:12.5px;font-weight:700;color:#fff;
        background:var(--fx-brand);border-radius:20px;padding:3px 12px;margin-bottom:9px}
    .xcfx-tip p{margin:0;font-size:14.5px;line-height:1.75}
    .xcfx-tip b{color:var(--fx-deep)}
    .xcfx-warn{margin-top:14px;background:var(--fx-tint);border:1px solid var(--fx-tint-line);
        border-left:4px solid var(--fx-brand);border-radius:0 11px 11px 0;
        padding:14px 18px;font-size:14.5px;line-height:1.75}
    .xcfx-warn strong{color:var(--fx-deep)}
    .xcfx-warn b{color:var(--fx-deep)}

    .xcfx-foot{font-size:13px;color:var(--fx-ink3);margin:26px 0 0;padding-top:14px;
        border-top:1px solid var(--fx-line);line-height:1.7}

    @media(max-width:600px){
        .xcfx-title{font-size:20px}
        .xcfx-rates{grid-template-columns:1fr 1fr;gap:12px 10px}
        .xcfx-rate-item:nth-child(3){padding-left:0;border-left:0}
        .xcfx-rate-item .v{font-size:19px}
        .xcfx-input input{font-size:20px}
        .xcfx-input select{min-width:96px;font-size:13.5px}
        .xcfx-tips{grid-template-columns:1fr}
    }
    @media (prefers-reduced-motion:reduce){.xcfx *{transition:none!important}}
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
        // side: 어느 칸을 사람이 쳤는가 → 반대쪽을 계산한다.
        // 입력이 비면 반대쪽도 비운다 — 안 그러면 '0' 이 남아 placeholder 가 안 보인다.
        function sync(side) {
            var src = side === 'a' ? a : b, dst = side === 'a' ? b : a;
            var from = side === 'a' ? ca.value : cb.value;
            var to = side === 'a' ? cb.value : ca.value;
            if (!String(src.value).trim()) { dst.value = ''; showRate(); return; }
            dst.value = fmt(convert(parseNum(src.value), from, to), to);
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
