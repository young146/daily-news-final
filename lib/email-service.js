import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import prisma from './prisma.js';

const FROM_NAME = 'XinChao Daily News';
const FROM_EMAIL = 'info@chaovietnam.co.kr';

// ─── SendGrid 설정 ────────────────────────────────────────────────────────────
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// ─── 측정 인프라: UTM 자동 부착 (Phase 3-1·3-2) ──────────────────────────────
// SOP: chao-vn-app/directives/MEASUREMENT_INFRA_SETUP.md
// GA4 캠페인 보고서에서 "이메일 → 사이트/앱" 전환을 측정할 수 있게 한다.

// UTM 을 적용할 자사 도메인 (외부 링크는 건드리지 않음)
const UTM_ALLOWED_HOSTS = new Set([
    'chaovietnam.co.kr',
    'www.chaovietnam.co.kr',
    'vnkorlife.com',
    'www.vnkorlife.com',
    'chaovietnam-login.web.app',
]);

// 캠페인 ID: daily_news_YYYYMMDD (UTC 기준)
function generateCampaignId() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `daily_news_${y}${m}${day}`;
}

// 단일 URL 에 UTM 파라미터 부착 — 이미 utm_* 이 있으면 보존 (사용자 지정 우선)
function addUtm(rawUrl, params) {
    try {
        const u = new URL(rawUrl);
        if (!UTM_ALLOWED_HOSTS.has(u.hostname)) return rawUrl;
        // unsubscribe 링크는 추적하지 않음 (수신자가 추적 거부 의미)
        if (/unsubscribe/i.test(u.pathname)) return rawUrl;
        for (const [k, v] of Object.entries(params)) {
            if (!u.searchParams.has(k)) u.searchParams.set(k, v);
        }
        return u.toString();
    } catch (_) {
        return rawUrl; // 파싱 실패 (mailto:, tel: 등) — 손대지 않음
    }
}

// HTML 본문 내 모든 <a href="..."> 에 UTM 부착
function addUtmToHtml(html, campaignId) {
    if (!html) return html;
    const params = {
        utm_source: 'email',
        utm_medium: 'newsletter',
        utm_campaign: campaignId,
    };
    return html.replace(/href\s*=\s*["']([^"']+)["']/gi, (match, url) => {
        const newUrl = addUtm(url, params);
        return `href="${newUrl}"`;
    });
}

// 받는 사람 이름을 끼워 넣을 자리표. 본문에 우연히 나올 수 없는 모양이어야 한다.
export const NAME_TOKEN = '-|이름|-';

/** 개인화를 못 하는 경로에서 토큰을 흔적 없이 지운다 (뒤따르는 쉼표·공백까지).
 *  정규식을 조립하지 않고 **문자열 그대로 치환**한다 — 토큰에 `|` 가 들어 있어
 *  정규식으로 만들면 이스케이프가 까다롭고 실수하면 본문을 망친다. */
export function stripNameToken(html) {
    if (!html) return html;
    return html
        .split(`${NAME_TOKEN}, `).join('')   // "홍길동 님, " 자리 → 통째로 제거
        .split(`${NAME_TOKEN},`).join('')
        .split(NAME_TOKEN).join('');         // 남은 토큰이 있으면 마저 제거
}

// ─── 1. SendGrid 배치 발송 ────────────────────────────────────────────────────
// nameByEmail: { '소문자이메일': '홍길동 님' } — 없으면 이름 없이 나간다 (2026-09-04)
export async function sendNewsletterSendGrid(toEmails, subject, htmlContent, campaignId, nameByEmail = null) {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0, failedEmails: [], succeededEmails: [] };
    }

    // 🔍 [측정 인프라] UTM 자동 부착 — caller 가 campaignId 안 주면 오늘 날짜로 생성
    const finalCampaignId = campaignId || generateCampaignId();
    htmlContent = addUtmToHtml(htmlContent, finalCampaignId);

    // 수신 거부 안내 주소 — 사람마다 달라야 한다(누가 눌렀는지 알아야 하니까)
    const rawBase = process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr';
    const baseUrl = /^https?:\/\//.test(rawBase) ? rawBase : `https://${rawBase}`;

    const BATCH_SIZE = 1000; // SendGrid 1회 요청 최대 1000명
    const batches = [];
    for (let i = 0; i < toEmails.length; i += BATCH_SIZE) {
        batches.push(toEmails.slice(i, i + BATCH_SIZE));
    }

    let totalSucceeded = 0;
    let totalFailed = 0;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
            // ✉️ [도달률] 메일 프로그램 위쪽의 「수신거부」 버튼을 만드는 헤더.
            //
            // 2026-08-28 까지 **이 경로에는 이 헤더가 아예 없었다.** SMTP 경로에만
            // 있었고, 실제 발송은 대부분 여기(SendGrid)로 나갔다.
            //
            // 버튼이 없으면 그만 받고 싶은 사람은 **「스팸 신고」를 누른다** — 눈에
            // 보이는 버튼이 그것뿐이기 때문이다. 그리고 스팸 신고 한 건의 대가는
            // 신고한 사람이 아니라 **남아 있는 나머지 전원**이 치른다(스팸함행).
            // 지메일·야후는 대량 발송자에게 이 헤더를 요구하고, 다음·네이버도
            // 신뢰 지표로 본다. 실제로 한메일에서 183명이 막혀 있었다.
            //
            // 주소에 받는 사람을 실어 보낸다 — 누가 눌렀는지 알아야 처리할 수 있다.
            // 받는 사람 이름 — HTML 은 한 벌이고, **치환으로 사람마다 다르게** 만든다.
            // (2026-09-04 사장님: "수신자의 이름을 적고 감성적인 인사를 앞에 붙이자")
            // 이름이 없는 사람에게는 빈 문자열이 들어가고, 템플릿이 이름 없이도
            // 문장이 되도록 짜여 있다 — "님," 만 덩그러니 남는 일은 없다.
            const personalizations = batch.map(email => {
                // 이름이 있으면 "곽성환 님, " 까지 만들어 넣는다 — 쉼표·공백을 여기서
                // 붙여야 이름 없는 사람에게 ", 오늘도…" 처럼 앞이 비는 일이 없다.
                const nm = (nameByEmail && nameByEmail[email.toLowerCase()]) || '';
                const greet = nm ? `${nm}, ` : '';
                return {
                    to: [{ email }],
                    // ⚠️ substitutions 는 **부분 문자열을 그대로 갈아끼운다.** 그래서 토큰을
                    //    본문에 없을 법한 모양(-|이름|-)으로 잡았다. 흔한 낱말을 토큰으로 쓰면
                    //    본문 아무 데나 걸려서 글이 깨진다.
                    substitutions: { '-|이름|-': greet },
                    headers: {
                        'List-Unsubscribe':
                            `<${baseUrl}/api/unsubscribe/one-click?e=${encodeURIComponent(email)}>, `
                            + `<mailto:${FROM_EMAIL}?subject=unsubscribe>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                    },
                };
            });
            await sgMail.send({
                personalizations,
                from: { email: FROM_EMAIL, name: FROM_NAME },
                subject,
                html: htmlContent,
                // 🔍 [측정] SendGrid 자체 추적을 끈다 — 안 끄면 우리 UTM 을 덮어쓴다.
                //
                // 계정 기본값으로 ganalytics 가 켜져 있어서, 우리가 addUtmToHtml 로 붙인
                //   utm_source=email&utm_medium=newsletter
                // 를 SendGrid 가 발송 직전에
                //   utm_source=sendgrid.com&utm_medium=email
                // 로 갈아버린다. 그 결과 GA4 가 뉴스레터 유입을 "sendgrid.com 에서 온 손님"
                // 으로 분류하고, 리포트에선 이메일이 실제의 1/9 로 축소돼 보였다.
                // (2026-07-17 실측: sendgrid.com 7,861 세션 vs email 1,010 세션.
                //  이메일 미발송일인 일요일에 sendgrid 유입이 329 -> 11 로 사라지는 것으로 확정)
                //
                // clickTracking 도 끈다 — 링크를 sendgrid 도메인으로 감싸 리다이렉트시키는데,
                // 그 클릭 통계는 회사 메일 보안 스캐너가 링크를 미리 눌러대는 탓에
                // 사람 클릭과 구분이 안 된다(클릭 21,866 > 사이트 전체 세션 11,071 = 물리적 불가).
                // 진짜 유입은 GA4 세션으로 센다.
                trackingSettings: {
                    clickTracking: { enable: false, enableText: false },
                    ganalytics: { enable: false },
                },
                // 대량 발송임을 밝힌다 — 부재중 자동응답이 우리에게 되돌아오는 것을 막고,
                // 받는 서버가 이 메일의 성격을 바르게 분류하게 한다.
                headers: {
                    'Precedence': 'bulk',
                    'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply',
                },
            });
            totalSucceeded += batch.length;
            console.log(`  ✅ [SendGrid] 배치 ${i + 1}/${batches.length}: ${batch.length}명 성공`);
        } catch (err) {
            totalFailed += batch.length;
            console.error(`  ❌ [SendGrid] 배치 ${i + 1}/${batches.length} 실패:`, err.message);
            throw err; // 폴백으로 전환하도록 상위에 에러 전파
        }
    }

    console.log(`[SendGrid DONE] 총 ${batches.length}배치 | 성공 ${totalSucceeded}명 | 실패 ${totalFailed}명`);
    return { batchTotal: batches.length, succeeded: totalSucceeded, failed: totalFailed, failedEmails: [], succeededEmails: [] };
}

// ─── 2. SMTP BCC 통합 발송 (폴백용, 동적 계정 전환 적용) ─────────────────────
const MAX_BCC_PER_BATCH = 50;
const MAX_EMAILS_PER_ACCOUNT = 1200;

export async function sendNewsletterBatchedBccSmtp(toEmails, subject, htmlContent, smtpAccount = 'both', campaignId) {
    if (!toEmails || toEmails.length === 0) {
        return { batchTotal: 0, succeeded: 0, failed: 0, failedEmails: [], succeededEmails: [], note: null };
    }

    // 🔍 [측정 인프라] UTM 자동 부착 — caller 가 campaignId 안 주면 오늘 날짜로 생성
    const finalCampaignId = campaignId || generateCampaignId();
    htmlContent = addUtmToHtml(htmlContent, finalCampaignId);

    // ⚠️ 이 경로는 한 통에 여러 명을 BCC 로 담으므로 **개인화가 성립하지 않는다.**
    //    이름 토큰을 지우지 않으면 받는 사람 화면에 `-|이름|-` 이 그대로 찍힌다.
    //    앞뒤 공백·쉼표까지 함께 지워 "  , 안녕하세요" 같은 흔적이 남지 않게 한다.
    htmlContent = stripNameToken(htmlContent);

    const accounts = [];
    if (smtpAccount === 'account1' || smtpAccount === 'both') {
        if (process.env.SMTP_USER && process.env.SMTP_PASS) accounts.push({ user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, label: '계정1' });
    }
    if (smtpAccount === 'account2' || smtpAccount === 'both') {
        if (process.env.SMTP_USER2 && process.env.SMTP_PASS2) accounts.push({ user: process.env.SMTP_USER2, pass: process.env.SMTP_PASS2, label: '계정2' });
    }
    if (smtpAccount === 'account3' || smtpAccount === 'both') {
        if (process.env.SMTP_USER3 && process.env.SMTP_PASS3) accounts.push({ user: process.env.SMTP_USER3, pass: process.env.SMTP_PASS3, label: '계정3' });
    }

    if (accounts.length === 0) {
        throw new Error('사용 가능한 SMTP 계정이 없습니다. 환경 변수를 확인하세요.');
    }

    const batches = [];
    for (let i = 0; i < toEmails.length; i += MAX_BCC_PER_BATCH) {
        batches.push(toEmails.slice(i, i + MAX_BCC_PER_BATCH));
    }

    console.log(`[SMTP BCC] 총 ${toEmails.length}명 → ${batches.length}개 묶음으로 분할 완료 (가용 계정 ${accounts.length}개)`);

    let totalSucceeded = 0;
    let totalFailed = 0;
    const allErrors = [];
    let currentAccIdx = 0;
    let sentCountThisAccount = 0;
    let activeTransporter = null;

    const setupTransporter = async (acc) => {
        const t = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: process.env.SMTP_SECURE !== 'false',
            pool: true,
            maxConnections: 1,
            auth: { user: acc.user, pass: acc.pass },
        });
        try { await t.verify(); } catch (e) { }
        return t;
    };

    activeTransporter = await setupTransporter(accounts[currentAccIdx]);

    for (let i = 0; i < batches.length; i++) {
        const batchEmails = batches[i];
        let sent = false;
        let lastError = null;

        while (!sent && currentAccIdx < accounts.length) {
            if (sentCountThisAccount + batchEmails.length > MAX_EMAILS_PER_ACCOUNT) {
                console.log(`[SMTP BCC] ⚠️ ${accounts[currentAccIdx].label} 안전 할당량(${MAX_EMAILS_PER_ACCOUNT}) 도달. 다음 계정으로 전환.`);
                try { activeTransporter.close(); } catch (_) { }
                currentAccIdx++;
                sentCountThisAccount = 0;
                if (currentAccIdx < accounts.length) {
                    activeTransporter = await setupTransporter(accounts[currentAccIdx]);
                }
                continue;
            }

            const acc = accounts[currentAccIdx];
            // 프로토콜 누락 env 값 보정 — List-Unsubscribe 헤더가 깨지면 스팸 분류 위험
            const rawBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr';
            const baseUrl = /^https?:\/\//.test(rawBaseUrl) ? rawBaseUrl : `https://${rawBaseUrl}`;
            try {
                await activeTransporter.sendMail({
                    from: `"${FROM_NAME}" <${acc.user}>`,
                    replyTo: `"${FROM_NAME}" <${FROM_EMAIL}>`,
                    to: acc.user,
                    bcc: batchEmails,
                    subject,
                    text: `씬짜오베트남 데일리뉴스\n\n뉴스 터미널에서 전체 뉴스를 확인하세요:\nhttps://chaovietnam.co.kr/daily-news-terminal/\n\n수신 거부(Unsubscribe): ${baseUrl}/unsubscribe`,
                    html: htmlContent,
                    headers: {
                        'Precedence': 'bulk',
                        'X-Auto-Response-Suppress': 'OOF, DR, RN, NRN, AutoReply',
                        // ⚠️ 이 경로는 BCC 로 여러 명을 한 통에 담는다. 그래서 **받는 사람마다
                        // 다른 주소**를 넣을 수 없고, 원클릭 해지(누가 눌렀는지 알아야 한다)도
                        // 성립하지 않는다. 그런데도 One-Click 을 **지원한다고 적어 두면**
                        // 메일 프로그램이 눌렀다가 실패하고, 그 사람은 결국 스팸 신고를 누른다.
                        // 그래서 여기서는 손으로 처리할 수 있는 두 길만 알린다.
                        'List-Unsubscribe': `<mailto:${FROM_EMAIL}?subject=unsubscribe>, <${baseUrl}/unsubscribe>`,
                        'List-Id': 'XinChao Vietnam Daily News <newsletter.chaovietnam.co.kr>',
                    }
                });

                sent = true;
                totalSucceeded += batchEmails.length;
                sentCountThisAccount += batchEmails.length;
                console.log(`  ✅ [${acc.label}] ${i + 1}번째 묶음 발송 성공 (${batchEmails.length}명)`);

                const delayMs = Math.floor(Math.random() * 3000) + 2000;
                await new Promise(r => setTimeout(r, delayMs));
            } catch (err) {
                lastError = err;
                console.error(`  🚨 [${acc.label}] ${i + 1}번째 묶음 에러: ${err.message}. 다음 계정으로 전환 후 재시도.`);
                try { activeTransporter.close(); } catch (_) { }
                currentAccIdx++;
                sentCountThisAccount = 0;
                if (currentAccIdx < accounts.length) {
                    activeTransporter = await setupTransporter(accounts[currentAccIdx]);
                }
            }
        }

        if (!sent) {
            totalFailed += batchEmails.length;
            const errorMsg = lastError ? lastError.message : '모든 계정 한도 초과';
            allErrors.push(`묶음 ${i + 1} 실패: ${errorMsg}`);
            console.error(`  ❌ ${i + 1}번째 묶음 최종 실패 처리 (누락: ${batchEmails.length}명)`);
        }
    }

    console.log(`[SMTP BCC DONE] 총 발송 그룹 ${batches.length}개 | 성공 ${totalSucceeded}명 | 실패 ${totalFailed}명`);

    let finalNote = allErrors.join(' | ');
    if (finalNote.length > 1000) finalNote = finalNote.substring(0, 995) + '...';

    return {
        batchTotal: batches.length,
        succeeded: totalSucceeded,
        failed: totalFailed,
        note: finalNote || null,
        failedEmails: [],
        succeededEmails: []
    };
}

// ─── 3. 통합 발송 (SendGrid 우선 → SMTP BCC 폴백) ────────────────────────────
/**
 * 수신자 목록 정리 — 공백 제거 + **같은 주소 중복 제거**.
 *
 * 왜 필요한가 (2026-08-28 실측):
 *   활성 구독자 7,210명 중 **17명이 대소문자만 다른 같은 주소**로 두 번 들어 있었다
 *   (예: Hong@paran.com / hong@paran.com). 메일 시스템은 주소의 대소문자를 구분하지
 *   않으므로 그 17명은 **같은 메일을 두 통씩** 받고 있었다.
 *
 * 왜 그냥 두면 안 되나: 같은 메일이 두 번 오면 스팸으로 신고하기 쉽고,
 * 스팸 신고는 발송 도메인 평판을 깎아 **나머지 7천 명의 도달률까지** 끌어내린다.
 *
 * 비교는 소문자로 하되 **보내는 주소는 원래 표기를 그대로** 쓴다(먼저 온 것을 남김).
 * 메일 규격상 로컬파트는 대소문자를 구분할 수 있어서, 우리가 임의로 소문자로
 * 바꿔 보내면 안 되는 서버가 이론상 있다.
 */
function dedupeRecipients(list) {
    const seen = new Set();
    const out = [];
    for (const raw of list || []) {
        const email = String(raw || '').trim();
        if (!email) continue;
        const key = email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(email);
    }
    return out;
}

// options.nameByEmail 로 받는 사람 이름을 넘긴다. SMTP(BCC) 폴백은 한 통에 여러 명을
// 담으므로 **개인화가 성립하지 않는다** — 그 경로에서는 이름 없이 나간다(토큰은 아래에서 지운다).
export async function sendNewsletterWithFallback(rawToEmails, subject, htmlContent, options = {}) {
    const { smtpAccount = 'both', campaignId, forceSmtp = false } = options;

    // 모든 발송이 이 함수를 지난다(뉴스레터·광고 알림·주간보고·OTP).
    // 그래서 중복 제거를 여기 한 곳에만 둔다 — 호출하는 쪽마다 챙기면 언젠가 빠뜨린다.
    const toEmails = dedupeRecipients(rawToEmails);
    const dropped = (rawToEmails?.length || 0) - toEmails.length;
    if (dropped > 0) {
        console.log(`[이메일] 중복·빈 주소 ${dropped}건 제외 → 수신자 ${toEmails.length}명`);
    }
    if (toEmails.length === 0) {
        console.warn('[이메일] 보낼 수신자가 없습니다 (전부 중복이거나 빈 주소).');
        return { batchTotal: 0, succeeded: 0, failed: 0, method: 'none', failedEmails: [], succeededEmails: [] };
    }
    // 🔍 [측정 인프라] 캠페인 ID 를 발송 단위로 한 번만 생성 — SendGrid 시도와 SMTP 폴백이 같은 캠페인으로 보고되게 함
    const finalCampaignId = campaignId || generateCampaignId();
    let result, method;

    // forceSmtp=true 면 SendGrid 건너뛰고 SMTP 로 직접 발송 (SendGrid 미배달 회피)
    // SendGrid 우선 시도 (forceSmtp 아니고 키가 있을 때만)
    if (!forceSmtp && process.env.SENDGRID_API_KEY) {
        try {
            console.log(`[이메일] SendGrid로 발송 시도 중... (캠페인: ${finalCampaignId})`);
            result = await sendNewsletterSendGrid(toEmails, subject, htmlContent, finalCampaignId, options.nameByEmail || null);
            console.log('[이메일] SendGrid 발송 완료');
            method = 'eservice';
        } catch (sgError) {
            console.warn('[이메일] SendGrid 실패, SMTP BCC 폴백으로 전환합니다...');
            console.warn('  SendGrid 오류:', sgError.message);
            try {
                result = await sendNewsletterBatchedBccSmtp(toEmails, subject, htmlContent, smtpAccount, finalCampaignId);
                method = 'smtp';
            } catch (smtpError) {
                console.error('[이메일] SMTP 폴백도 실패:', smtpError.message);
                throw new Error(`SendGrid 실패: ${sgError.message} | SMTP 폴백 실패: ${smtpError.message}`);
            }
        }
    } else {
        // forceSmtp 이거나 SendGrid 키 없음 → SMTP 직접 사용
        console.log(`[이메일] SMTP BCC로 발송... (forceSmtp=${forceSmtp}, 캠페인: ${finalCampaignId})`);
        try {
            result = await sendNewsletterBatchedBccSmtp(toEmails, subject, htmlContent, smtpAccount, finalCampaignId);
            method = 'smtp';
        } catch (smtpErr) {
            console.error('[이메일] SMTP 발송 실패:', smtpErr.message);
            result = { batchTotal: 0, succeeded: 0, failed: toEmails.length, note: smtpErr.message, failedEmails: [], succeededEmails: [] };
            method = 'smtp';
        }
    }

    // ── 발송 로그 DB 저장 ──────────────────────────────────────
    try {
        const log = await prisma.emailSendLog.create({
            data: {
                subject,
                method,
                total: toEmails.length,
                succeeded: result.succeeded ?? 0,
                failed: result.failed ?? 0,
                batches: result.batchTotal ?? 0,
                note: result.note ?? null,
            },
        });
        console.log('[이메일] 발송 로그 저장 완료. Log ID:', log.id);

        if (result.failedEmails?.length > 0 || result.succeededEmails?.length > 0) {
            const detailData = [];
            if (result.succeededEmails) {
                result.succeededEmails.forEach(email => {
                    detailData.push({ logId: log.id, email, status: 'success' });
                });
            }
            if (result.failedEmails) {
                result.failedEmails.forEach(({ email, errorMsg }) => {
                    detailData.push({ logId: log.id, email, status: 'failed', errorMsg });
                });
            }
            for (let i = 0; i < detailData.length; i += 500) {
                const chunk = detailData.slice(i, i + 500);
                await prisma.emailSendDetail.createMany({ data: chunk });
            }
        }
    } catch (logErr) {
        console.error('[이메일] 로그 저장 실패:', logErr.message, logErr.stack);
    }

    return { ...result, method };
}
