// ============================================================
// 측정 인프라 Phase 4 — 카톡 오픈채팅 일일 텍스트 생성기
// 작성: 2026-05-20
// SOP: chao-vn-app/directives/MEASUREMENT_INFRA_SETUP.md
// ============================================================
//
// 카톡 오픈채팅방은 정책상 이미지 광고 카드 첨부 불가 + 자동 게시 불가.
// → 매일 *텍스트 1장* 을 사용자가 수동으로 복사·붙여넣기.
// → 이 모듈이 그 "복사용 텍스트" 를 자동 생성하고 모든 링크에 UTM 을 자동 부착한다.
//
// 사용:
//   import { buildKakaoBroadcastText, generateKakaoCampaignId } from '@/lib/kakao-broadcast';
//   const text = buildKakaoBroadcastText(newsItems, { terminalUrl: '...' });
//   console.log(text); // 사용자 복사

const APP_DOWNLOAD_URL = 'https://chaovietnam-login.web.app/download';

// 캠페인 ID: daily_news_YYYYMMDD (이메일과 동일 포맷 — GA4 보고서에서 채널별 비교 가능)
export function generateKakaoCampaignId(date) {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `daily_news_${y}${m}${day}`;
}

// 카톡 UTM 부착 — 이메일과 다른 utm_source/utm_medium 사용
function addKakaoUtm(rawUrl, campaignId) {
    try {
        const u = new URL(rawUrl);
        // unsubscribe 또는 외부 도메인은 손대지 않음 (이메일과 동일 보호)
        if (/unsubscribe/i.test(u.pathname)) return rawUrl;
        // vietnamsari.com = 실전노트 블로그 (2026-08-30 유통 자동화 트랙에서 추가 —
        // 우리 자산이므로 UTM 을 붙인다. GA4 는 블로그 쪽 별도 속성에서 잡힘)
        const allowed = ['chaovietnam.co.kr', 'www.chaovietnam.co.kr', 'vnkorlife.com', 'www.vnkorlife.com', 'chaovietnam-login.web.app', 'vietnamsari.com', 'www.vietnamsari.com'];
        if (!allowed.includes(u.hostname)) return rawUrl;
        if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'kakao');
        if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', 'openchat');
        if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', campaignId);
        return u.toString();
    } catch (_) {
        return rawUrl;
    }
}

/**
 * 카톡 오픈채팅용 텍스트 1장 생성
 *
 * @param {Array} newsItems - { title, translatedTitle?, wordpressUrl?, summary? } 의 배열
 * @param {Object} options
 *   - terminalUrl: 뉴스 터미널 URL (기본: chaovietnam.co.kr/daily-news-terminal/)
 *   - dateString: 표시할 날짜 문자열 (기본: 오늘 베트남 시각)
 *   - maxItems: 표시할 뉴스 개수 (기본: 5 — 카톡 메시지 길이 제한 고려)
 *   - campaignId: GA4 캠페인 ID (생략 시 자동 생성)
 *   - includeAppDownload: 앱 다운로드 링크 포함 여부 (기본: true)
 *   - blogPosts: 실전노트 새 글 [{ title, link }] — 있으면 블록 추가 (기본: 없음)
 * @returns {string} 카톡 채팅창에 그대로 붙여넣을 수 있는 텍스트
 */
export function buildKakaoBroadcastText(newsItems = [], options = {}) {
    const {
        terminalUrl = 'https://chaovietnam.co.kr/daily-news-terminal/',
        dateString,
        maxItems = 5,
        campaignId = generateKakaoCampaignId(),
        includeAppDownload = true,
        blogPosts = [],
    } = options;

    const today = dateString || new Date().toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    const taggedTerminal = addKakaoUtm(terminalUrl, campaignId);
    const taggedApp = addKakaoUtm(APP_DOWNLOAD_URL, campaignId);

    const items = newsItems.slice(0, maxItems);

    let text = `📰 씬짜오베트남 오늘의 뉴스 (${today})\n\n`;

    items.forEach((item, idx) => {
        const title = item.translatedTitle || item.title || '(제목 없음)';
        const url = item.wordpressUrl || terminalUrl;
        const taggedUrl = addKakaoUtm(url, campaignId);
        text += `${idx + 1}. ${title}\n👉 ${taggedUrl}\n\n`;
    });

    text += `📌 전체 뉴스 보기:\n${taggedTerminal}\n`;

    // 📝 실전노트 새 글 (2026-08-30 유통 자동화 — 새 글이 있는 날만 붙는다)
    if (blogPosts.length) {
        text += `\n📝 베트남 살이 실전노트 — 새 글\n`;
        blogPosts.forEach((p) => {
            text += `· ${p.title}\n👉 ${addKakaoUtm(p.link, campaignId)}\n`;
        });
    }

    if (includeAppDownload) {
        text += `\n📱 씬짜오베트남 앱 다운로드:\n${taggedApp}\n`;
    }

    text += `\n— 씬짜오베트남 · 2002년부터 베트남 한인과 함께`;

    return text;
}
