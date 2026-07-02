// =============================================================================
//  구직자 → 맞는 새 공고 매칭 메일  (규칙기반 매칭 + SMTP 발송)
// =============================================================================
//  "가입/이력서 등록하면 맞는 공고를 매칭해 드립니다" 약속의 실행 (1~2회 수동 발송).
//
//  안전장치:
//   - 기본은 DRY-RUN (발송 안 함). 발송은 명시적 플래그 필요.
//   - matchOptOut=true (취업/거부) 구직자는 자동 제외.
//   - 진짜 이메일(합성 kakao 주소 제외) 보유 구직자만 대상.
//   - 이메일 중복은 1명만 유지 (실명 있는 쪽 우선).
//   - "매일" 약속 금지. CTA·opt-out 링크는 추적/처리 가능한 URL로.
//
//  모드:
//   node scripts/send-job-matches.js            → DRY-RUN (미리보기 .tmp/job-match-preview.html)
//   node scripts/send-job-matches.js --test     → 테스트: 상위 3통을 TEST_EMAIL 로만 발송
//   node scripts/send-job-matches.js --send      → 실제 발송 (전체 대상)
//   옵션: --top N (기본 3)
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env.local'), override: true });
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const argv = process.argv.slice(2);
const MODE = argv.includes('--send') ? 'send' : argv.includes('--test') ? 'test' : 'dryrun';
const TOP = (() => { const i = argv.indexOf('--top'); return i >= 0 ? parseInt(argv[i + 1], 10) || 3 : 3; })();

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://chaovietnam.co.kr').replace(/\/$/, '');
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
const FROM_NAME = '씬짜오 구인구직';
const TEST_EMAIL = process.env.TEST_EMAIL;

if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
}
const db = admin.firestore();

// ── 매칭 규칙 (무료, 규칙기반) ───────────────────────────────────────────────
const TRACK_KEYWORDS = {
  '생산직': ['생산', '제조', '품질', '공정', '오퍼레이터', '현장', '포장', '조립'],
  '관리직': ['관리', '기획', '총괄', '매니저', '팀장', '공장장', '법인장', '주재'],
  '서비스직': ['서비스', '판매', '매장', '식당', '호텔', '미용', '고객', '접객'],
  '사무직': ['사무', '경리', '총무', '회계', '인사', '구매', '자재', '문서', '비서'],
  '현장직': ['현장', '시공', '건설', '설치', '설비', '토목', '인테리어'],
  '영업직': ['영업', '세일즈', '바이어', '수주', '거래처', '마케팅'],
  '기술직/IT': ['기술', 'IT', '개발', '엔지니어', '전산', '프로그램', '설계', '기계', '전기'],
  '기타': [],
};
const jobText = (j) => [j.title, j.industry, j.employmentType, j.jobType, j.description, j.requirements].filter(Boolean).join(' ');
function scoreJob(cand, job) {
  const tracks = (cand.career && (cand.career.jobTracks || cand.career.desiredJobTracks)) || [];
  const text = jobText(job); let score = 0; const why = [];
  for (const tr of tracks) { const kws = TRACK_KEYWORDS[tr] || []; if (kws.some(k => text.includes(k))) { score += 10; why.push(tr); } }
  const loc = ((cand.profile && cand.profile.desiredLocation) || cand.desiredLocation || '').toString();
  if (loc && job.city && (loc.includes(job.city) || job.city.includes(loc))) { score += 5; why.push('지역'); }
  const c = job.createdAt && job.createdAt.toDate ? job.createdAt.toDate() : null;
  if (c && (Date.now() - c.getTime()) < 30 * 864e5) score += 2;
  return { score, why: [...new Set(why)] };
}
function realEmail(cand) {
  const contact = cand.contact || {};
  const e = (contact.email || (cand.profile && cand.profile.email) || cand.email || '').toString().trim();
  if (!e || !e.includes('@')) return null;
  if (/^kakao_/.test(e) || /@chaovietnam\.co\.kr$/i.test(e)) return null;
  return e.toLowerCase();
}
const candName = (c) => (c.profile && c.profile.name) || c.name || '';
// 이름이 실명/한글이면 사용, 카카오 아이디(영문+숫자)면 "회원"으로
function greetingName(c) {
  const n = candName(c).trim();
  if (n && (/[가-힣]/.test(n) || n.includes(' '))) return n;
  return '회원';
}

// 공고별 딥링크 — 앱 설치 시 해당 공고로 열림(유니버설 링크), 미설치 시 웹(설치 안내).
// 앱 공유와 동일한 vnkorlife.com/jobs/<id> 형식 (deepLinkUtils.js TYPE_TO_PATH).
const JOB_URL = (id) => `https://www.vnkorlife.com/jobs/${id}?utm_source=email&utm_medium=jobmatch&utm_campaign=candidate_match`;
const QR_IMG = (url, size = 96) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(url)}`;

// ── 메일 HTML ────────────────────────────────────────────────────────────────
function buildEmailHtml(greeting, jobs, optoutUrl) {
  const cards = jobs.map(j => {
    const url = JOB_URL(j.id);
    return `
    <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:10px;border:1px solid #eee;border-radius:8px;">
      <tr>
        <td style="padding:12px 14px;vertical-align:top;">
          <a href="${url}" style="text-decoration:none;">
            <div style="font-weight:700;font-size:15px;color:#1565C0;line-height:1.35;">${j.title || '(제목 없음)'}</div>
            <div style="font-size:13px;color:#555;margin-top:4px;">📍 ${j.city || '-'} · ${j.employmentType || '-'}${j.industry ? ' · ' + j.industry : ''}</div>
            <div style="font-size:12px;color:#999;margin-top:4px;">맞춤 근거: ${(j._why || []).join(', ') || '신규 공고'}</div>
          </a>
        </td>
        <td width="112" style="padding:10px 12px;text-align:center;vertical-align:middle;border-left:1px solid #f0f0f0;">
          <img src="${QR_IMG(url)}" width="84" height="84" alt="QR" style="display:block;margin:0 auto;"/>
          <div style="font-size:10px;color:#1565C0;margin-top:4px;line-height:1.3;">폰으로 스캔<br/>→ 앱에서 열기</div>
        </td>
      </tr>
    </table>`;
  }).join('');
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:'Apple SD Gothic Neo',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:14px;padding:24px;">
      <div style="font-size:13px;color:#888;">씬짜오 구인구직</div>
      <h2 style="margin:6px 0 2px;font-size:20px;color:#222;">${greeting}님께 맞는 새 공고 ${jobs.length}건</h2>
      <p style="font-size:14px;color:#555;line-height:1.6;margin:8px 0 14px;">
        등록해 주신 희망 직무를 바탕으로, 지금 <b>모집 중인 공고</b> 중에서 골라봤어요.
      </p>
      <div style="background:#EaF2FC;border-radius:8px;padding:10px 14px;font-size:13px;color:#1565C0;line-height:1.6;margin-bottom:14px;">
        📱 <b>휴대폰으로 보고 계시면</b> 공고를 눌러 앱에서 바로 여세요.<br/>
        💻 <b>PC로 보고 계시면</b> 각 공고의 <b>QR을 휴대폰으로 찍으면</b> 앱에서 열립니다. (앱이 없으면 설치 안내로 이동)
      </div>
      ${cards}
      <p style="font-size:12px;color:#aaa;line-height:1.6;margin-top:14px;border-top:1px solid #eee;padding-top:14px;">
        2002년부터 베트남 한인과 함께한 씬짜오가 보내드립니다.<br/>
        이미 취업하셨거나 매칭을 원치 않으시면 <a href="${optoutUrl}" style="color:#999;">여기</a>를 눌러 회신해 주세요. 더 보내지 않겠습니다.
      </p>
    </div>
  </div></body></html>`;
}

function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// 관리자(본인)에게 "누구에게 어떤 공고가 갔는지" 참조 요약본 1통
async function emailSummary(results, jobsCount) {
  if (!TEST_EMAIL) { console.warn('TEST_EMAIL 없음 → 참조본 생략'); return; }
  const rows = results.map((r, i) => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:8px;color:#888;">${i + 1}</td>
      <td style="padding:8px;font-weight:600;">${candName(r.c) || '(무명)'}</td>
      <td style="padding:8px;color:#1565C0;">${r.c._email}</td>
      <td style="padding:8px;font-size:13px;color:#444;">${r.jobs.map(j => `• ${j.title} <span style="color:#999">(${j.city || '-'})</span>`).join('<br/>')}</td>
    </tr>`).join('');
  const html = `<div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:760px;margin:0 auto;">
    <h2 style="color:#222;">📋 구직자 매칭 메일 발송 참조본</h2>
    <p style="color:#555;">총 <b>${results.length}명</b>에게 개인화 공고가 발송되었습니다. (모집중 공고 ${jobsCount}건 기준)</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="background:#f0f3f8;text-align:left;"><th style="padding:8px;">#</th><th style="padding:8px;">이름</th><th style="padding:8px;">이메일</th><th style="padding:8px;">매칭 공고 3건</th></tr>
      ${rows}
    </table></div>`;
  await makeTransport().sendMail({ from: `"씬짜오 매칭(참조)" <${FROM_EMAIL}>`, to: TEST_EMAIL, subject: `[참조] 구직자 매칭 발송 내역 ${results.length}명`, html });
  console.log(`📋 참조 요약본 발송 → ${TEST_EMAIL}`);
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
(async () => {
  // 1) 모집중 공고
  const jobsSnap = await db.collection('Jobs').where('status', '==', '모집중').get();
  const jobs = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 2) 대상 구직자: 진짜 이메일 + opt-out 아님 + 취업류 status 아님
  const candSnap = await db.collection('candidates').get();
  const byEmail = new Map();
  candSnap.forEach(doc => {
    const d = { id: doc.id, ...doc.data() };
    if (d._migratedFromJobs) return;
    if (d.matchOptOut === true) return;
    const status = d.status || (d.crm && d.crm.status) || '';
    if (/취업|채용완료|종료|비활성/.test(status)) return;
    const email = realEmail(d);
    if (!email) return;
    d._email = email;
    // 이메일 중복 제거 — 실명 있는 쪽 우선, 아니면 먼저 들어온 것 유지
    const prev = byEmail.get(email);
    if (!prev || (!candName(prev) && candName(d))) byEmail.set(email, d);
  });
  const targets = [...byEmail.values()];

  // 3) 매칭
  const results = [];
  for (const c of targets) {
    const scored = jobs.map(j => ({ j, ...scoreJob(c, j) })).filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, TOP);
    if (scored.length) results.push({ c, jobs: scored.map(x => ({ ...x.j, _why: x.why })) });
  }

  console.log(`\n=== 구직자 매칭 발송 [${MODE.toUpperCase()}] ===`);
  console.log(`모집중 공고 ${jobs.length} · 대상(중복제거 후) ${targets.length} · 매칭성공 ${results.length}`);

  // opt-out: mailto 회신 (배포 불필요, Vercel-Firebase 의존 없음). 21명 규모는 수동 처리.
  const optoutLink = `mailto:${FROM_EMAIL}?subject=${encodeURIComponent('매칭 메일 중단 요청')}&body=${encodeURIComponent('매칭 메일 수신을 중단하고 싶습니다.')}`;

  // ── 참조 요약본만 단독 발송 (--summary) ──
  if (argv.includes('--summary')) { await emailSummary(results, jobs.length); return; }

  // DRY-RUN: 미리보기만
  if (MODE === 'dryrun') {
    const tmpDir = path.join(process.cwd(), '.tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const html = results.slice(0, 3).map(r => {
      return `<h3 style="font-family:sans-serif">▶ ${candName(r.c) || '(무명)'} &lt;${r.c._email}&gt; (인사: ${greetingName(r.c)}님)</h3>` + buildEmailHtml(greetingName(r.c), r.jobs, optoutLink);
    }).join('<hr style="margin:32px 0"/>');
    const out = path.join(tmpDir, 'job-match-preview.html');
    fs.writeFileSync(out, html || '<p>매칭 없음</p>');
    results.forEach(r => console.log(`  ${candName(r.c) || '(무명)'} <${r.c._email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}> → ${r.jobs.map(j => j.title).join(' / ')}`));
    console.log(`\n📄 미리보기: ${out}  (발송 안 함)`);
    console.log('실제 발송: --test (본인에게 3통) → 확인 후 --send (전체)');
    return;
  }

  // 발송 (test/send 공통) — SMTP
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const list = MODE === 'test' ? results.slice(0, 3) : results;
  if (MODE === 'test' && !TEST_EMAIL) { console.error('TEST_EMAIL 환경변수 없음'); process.exit(1); }
  let ok = 0, fail = 0;
  for (const r of list) {
    const greeting = greetingName(r.c);
    const to = MODE === 'test' ? TEST_EMAIL : r.c._email;
    const subject = `${MODE === 'test' ? '[TEST] ' : ''}[씬짜오 구인구직] ${greeting}님께 맞는 새 공고 ${r.jobs.length}건`;
    try {
      await transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to,
        subject,
        html: buildEmailHtml(greeting, r.jobs, optoutLink),
      });
      ok++;
      console.log(`  ✅ ${to}  (${greeting})`);
    } catch (e) {
      fail++;
      console.error(`  ❌ ${to}  (${greeting}): ${e.message}`);
    }
    await new Promise(res => setTimeout(res, 1200)); // throttle
  }
  console.log(`\n발송 완료: 성공 ${ok} / 실패 ${fail}` + (MODE === 'test' ? `  → 전부 ${TEST_EMAIL} 로 보냄(테스트)` : ''));

  // 실발송 시 본인에게 참조 요약본 자동 발송
  if (MODE === 'send') await emailSummary(results, jobs.length);
})().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
