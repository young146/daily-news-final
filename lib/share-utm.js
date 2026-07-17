// ============================================================
// 어드민 "복사" 버튼용 유입 추적(UTM) 부착
// 작성: 2026-07-17
// ============================================================
//
// 왜 필요한가:
//   유입의 44%(주 5,489세션)가 "직접 방문"으로 잡혀 정체불명이었다. 직원이 매일 어드민에서
//   URL 을 복사해 카톡방 3개·페이스북에 붙여넣는데, 그 링크에 이름표가 없어서 GA4 가
//   출처를 모른 채 전부 "직접 방문"에 쓸어담기 때문이다.
//   → 복사 시점에 목적지 이름표를 붙이면 채널별 기여도가 보인다.
//
// 왜 목적지별로 버튼을 나눴나:
//   같은 URL 을 카톡에도 페북에도 붙여넣으므로, 버튼 하나로는 어디로 갈지 알 수 없다.
//   하나로 뭉뚱그리면 이메일이 "기타"에 묻혀 1/10 로 보이던 것과 같은 일이 생긴다.
//
// 브라우저 전용 (어드민 클라이언트 컴포넌트). URL/searchParams 를 그대로 쓴다.
//   ※ 앱(React Native)은 URL.searchParams 가 없어서 문자열로 붙인다 —
//     chao-vn-app/utils/deepLinkUtils.js 의 addShareUtm 참고. 두 곳의 utm_source 값을
//     일치시켜야 리포트에서 한 채널로 합산된다.

// utm_source 는 GA4 리포트의 bucket() 과 짝이다:
//   daily-news-final/lib/ga4-channels-report.js
// ⚠️ 카톡을 'kakao' 로 두면 안 된다 — bucket() 의 daum/kakao 규칙에 걸려
//    다음/카카오 *검색* 유입과 한 덩어리가 된다. 그래서 'kakaotalk'.
export const SHARE_TARGETS = {
    kakao: {
        key: 'kakao',
        label: '카톡용',
        emoji: '💬',
        utm_source: 'kakaotalk',
        // 오픈채팅방 3개뿐 아니라 단톡방 50여 개에도 올린다 → 방별 구분은 불가능하고
        // 필요도 없다("카카오톡이면 충분"). medium 은 '직원이 카톡에 뿌린 것' 정도의 의미.
        // (앱 개인공유는 medium=share 로 구분됨 — chao-vn-app/utils/deepLinkUtils.js)
        utm_medium: 'social',
    },
    // ⛔ 페이스북은 여기 없다 (일부러). 페북은 어드민에서 링크를 복사하는 게 아니라
    //    "페북 미리보기 + 게시" 로 4개 페이지에 *자동 게시* 된다(app/api/fb-publish/route.js).
    //    즉 아무도 페북용 링크를 복사하지 않으므로 버튼이 있어봐야 안 눌린다.
    //    자동 게시가 올리는 링크(fb-publish route.js:81)에 UTM 을 붙이는 건 별개 문제이고,
    //    잘 돌고 있는 자동화라 건드리지 않기로 함(사장님 결정 2026-07-17).
    //    ※ 앱의 공유 버튼에는 facebook 이 있다 — 그건 사용자가 직접 누르는 수동 공유라 유효.
    //      (chao-vn-app/utils/deepLinkUtils.js PLATFORM_TO_UTM_SOURCE)
    zalo: {
        key: 'zalo',
        label: 'Zalo용',
        emoji: '💠',
        utm_source: 'zalo',
        utm_medium: 'social',
    },
};

// 우리 도메인에만 붙인다 (외부 링크에 우리 utm 을 붙이지 않음)
const ALLOWED_HOSTS = new Set([
    'chaovietnam.co.kr',
    'www.chaovietnam.co.kr',
    'vnkorlife.com',
    'www.vnkorlife.com',
    'chaovietnam-login.web.app',
]);

/**
 * 캠페인 ID: daily_news_YYYYMMDD
 * 이메일(email-service.js generateCampaignId)·카톡(kakao-broadcast.js)과 동일 포맷 —
 * GA4 에서 "같은 날 발행분이 채널별로 얼마나 왔나"를 한 줄로 비교하기 위함.
 */
export function generateShareCampaignId(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `daily_news_${y}${m}${day}`;
}

/**
 * URL 에 목적지별 UTM 부착
 * @param {string} rawUrl - 원본 URL (기존 쿼리 ?v=0717 등이 있어도 보존됨)
 * @param {string} targetKey - 'kakao' | 'facebook'
 * @param {string} [campaignId] - 생략 시 오늘 날짜로 자동 생성
 * @returns {string} UTM 이 붙은 URL. 대상/호스트가 맞지 않으면 원본 그대로.
 */
export function withShareUtm(rawUrl, targetKey, campaignId) {
    const t = SHARE_TARGETS[targetKey];
    if (!t || !rawUrl) return rawUrl;
    try {
        const u = new URL(rawUrl);
        if (!ALLOWED_HOSTS.has(u.hostname)) return rawUrl;
        // 이미 지정된 utm 이 있으면 존중 (사용자 지정 우선)
        if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', t.utm_source);
        if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', t.utm_medium);
        if (!u.searchParams.has('utm_campaign')) {
            u.searchParams.set('utm_campaign', campaignId || generateShareCampaignId());
        }
        return u.toString();
    } catch (_) {
        return rawUrl; // 파싱 실패 시 원본 유지 — 복사 자체는 되어야 한다
    }
}

/**
 * 복사 + 목적지 UTM 부착을 한 번에 (어드민 버튼용)
 * @returns {Promise<string>} 실제로 복사된 URL
 */
export async function copyWithShareUtm(rawUrl, targetKey, campaignId) {
    const url = withShareUtm(rawUrl, targetKey, campaignId);
    await navigator.clipboard.writeText(url);
    return url;
}
