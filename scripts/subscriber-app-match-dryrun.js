// Phase A: 이메일 세그먼트 분할 가능성 측정 (Read-only).
// DB 변경/발송 X. 단순 통계만 출력.
//
// 매칭 방식: Subscriber.email (구독자 DB) ∩ Firebase Auth user.email (앱 가입자)
// 한계: 회사 이메일 구독 + 개인 이메일 앱 가입 케이스는 매칭 실패.
//
// 사용법: node scripts/subscriber-app-match-dryrun.js

const { PrismaClient } = require('@prisma/client');
const path = require('node:path');
// Next.js 우선순위 흉내: .env.local 가 .env 를 덮음
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
require('dotenv').config({ path: path.join(process.cwd(), '.env.local'), override: true });

const prisma = new PrismaClient();

async function loadFirebaseAuthEmails() {
  // Firebase Admin SDK 초기화
  const admin = require('firebase-admin');
  if (admin.apps.length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(svc) });
    } else {
      admin.initializeApp(); // Application Default Credentials
    }
  }

  const auth = admin.auth();
  const emails = new Set();
  let nextPageToken = undefined;
  let totalUsers = 0;
  let usersWithEmail = 0;

  do {
    const res = await auth.listUsers(1000, nextPageToken);
    for (const u of res.users) {
      totalUsers++;
      if (u.email) {
        emails.add(u.email.toLowerCase().trim());
        usersWithEmail++;
      }
    }
    nextPageToken = res.pageToken;
  } while (nextPageToken);

  return { emails, totalUsers, usersWithEmail };
}

async function main() {
  console.log('=== Phase A 매칭 dry-run ===\n');

  console.log('1) Subscriber DB 로드...');
  const subscribers = await prisma.subscriber.findMany({
    where: { isActive: true },
    select: { email: true, company: true, name: true },
  });
  const subEmails = new Set(subscribers.map(s => s.email.toLowerCase().trim()));
  console.log(`   활성 구독자: ${subscribers.length}명`);

  console.log('\n2) Firebase Auth 사용자 로드...');
  const { emails: appEmails, totalUsers, usersWithEmail } = await loadFirebaseAuthEmails();
  console.log(`   앱 가입자 전체: ${totalUsers}명`);
  console.log(`   이메일 있는 가입자: ${usersWithEmail}명 (소셜 로그인으로 이메일 비공개인 경우 제외)`);
  console.log(`   고유 이메일 수: ${appEmails.size}명`);

  console.log('\n3) 교집합 계산...');
  let matched = 0;
  const matchedSamples = [];
  for (const e of subEmails) {
    if (appEmails.has(e)) {
      matched++;
      if (matchedSamples.length < 5) matchedSamples.push(e);
    }
  }

  const unmatched = subEmails.size - matched;
  const matchRate = ((matched / subEmails.size) * 100).toFixed(1);

  console.log(`\n=== 결과 ===`);
  console.log(`구독자 ∩ 앱가입자  : ${matched}명 (${matchRate}%)  → "앱 설치자(추정)" 그룹`);
  console.log(`구독자 only        : ${unmatched}명 (${(100 - parseFloat(matchRate)).toFixed(1)}%)  → "미설치자(추정)" 그룹`);
  console.log(`앱가입자 only      : ${appEmails.size - matched}명  → 구독 안 한 앱 사용자`);

  console.log(`\n매칭된 이메일 샘플 (최대 5개):`);
  matchedSamples.forEach(e => {
    // 개인정보 보호: 앞 3글자 + ***
    const masked = e.length > 3 ? e.slice(0, 3) + '***' + e.slice(e.indexOf('@')) : '***';
    console.log(`  - ${masked}`);
  });

  console.log(`\n📊 시사점:`);
  if (matched >= 1000) {
    console.log(`   → 매칭 충분. Phase B 진행 가치 있음. 미설치자 ${unmatched}명에게 집중 CTA.`);
  } else if (matched >= 300) {
    console.log(`   → 매칭 일부. Phase B 가능하나 효과 제한적. 정확도 향상 방안 함께 검토.`);
  } else {
    console.log(`   → 매칭 적음. 회사/개인 이메일 분리 가설 입증. 별도 매칭 방안 필요 (앱 회원가입 시 구독 이메일 통합 권유 등).`);
  }
}

main()
  .catch(e => { console.error('\n❌ 실패:', e.message); console.error(e.stack); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
