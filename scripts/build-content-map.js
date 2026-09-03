// ════════════════════════════════════════════════════════════════
// 베트남 내부 콘텐츠 자산 지도 (읽기 전용)
// ────────────────────────────────────────────────────────────────
// 왜: 2026-09-03 실측 — "베트남 여행" 검색 21.4위, "나트랑 여행"·"푸꾸옥 여행"은 노출 0.
//     원인은 콘텐츠 부족이 아니라 **구조 부재**였다. 여행·미식 기사가 1,300편 넘게 있는데
//     그것을 묶는 관문(허브) 페이지가 없어, 구글이 "이 사이트는 베트남 여행을 다룬다"고
//     판단할 근거가 없다. 창고에 물건은 가득한데 간판도 진열대도 없는 상태.
//
// 무엇: 데일리 뉴스를 뺀 **베트남 내부 콘텐츠**를 전부 받아 도시·주제로 분류하고,
//       서치콘솔 90일 성과를 붙여 "허브를 어디에 몇 개 세울지"의 근거를 만든다.
//       아무것도 쓰지 않는다. 화면 출력 + .tmp/content-map.json 저장뿐.
//
// 실행: node scripts/build-content-map.js            (요약)
//       node scripts/build-content-map.js --detail   (도시×주제 교차표까지)
//       node scripts/build-content-map.js --no-gsc   (서치콘솔 없이 분류만)
//
// 인증: 서치콘솔 부분만 FIREBASE_SERVICE_ACCOUNT_JSON 필요. 없으면 분류만 하고 넘어간다.
// ════════════════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

const WP = 'https://chaovietnam.co.kr/wp-json/wp/v2';
const API = 'https://www.googleapis.com/webmasters/v3';
const SITE = 'sc-domain:chaovietnam.co.kr';
const args = process.argv.slice(2);
const DETAIL = args.includes('--detail');
const NO_GSC = args.includes('--no-gsc');

// ── 베트남 내부 콘텐츠 카테고리 ─────────────────────────────────
// 데일리 뉴스(31)·교민소식(32)·PDF(407) 는 제외한다 — 하루짜리 속보라 에버그린이 아니다.
// 여기 담은 것은 "언제 읽어도 유효한" 잡지 콘텐츠다.
const CATS = {
  여행: [29, 62, 415, 21],                  // TRAVEL, 거리 탐방, 골프여행, INFORMATION
  미식: [427, 451, 452, 8, 30, 410, 380],   // F&R, DiningOut, 외식업정보, 베트남맛집, VN FOOD, FOOD STORY, 음식동의보감
  생활: [349, 379, 348, 56, 387, 27],       // Life&Food, Life Beginner, Super Great, 살림비법, Beauty, PHOTO ESSAY
  정보: [4, 19, 20, 57, 344, 361],          // VN Information, CULTURE, HISTORY, FOCUS, REAL ESTATE, BIZ INFO
  골프: [413, 418, 448, 417],               // GOLF & SPORTS 계열
};

// ── 도시 사전 ────────────────────────────────────────────────
// 표기 흔들림(나트랑/나짱, 호치민/사이공)을 하나로 모은다. 안 모으면 같은 도시가 갈라진다.
const CITIES = {
  호치민: ['호치민', '호찌민', '사이공', '떤손녓', '푸미흥', '타오디엔'],
  하노이: ['하노이', '노이바이', '호안끼엠', '미딩'],
  다낭: ['다낭', '미케', '바나힐'],
  나트랑: ['나트랑', '나짱', '냐짱', '깜란'],
  푸꾸옥: ['푸꾸옥', '푸꿕', '푸국'],
  달랏: ['달랏', '달라트'],
  호이안: ['호이안'],
  하롱: ['하롱', '할롱'],
  후에: ['후에'],
  사파: ['사파'],
  붕따우: ['붕따우'],
  무이네: ['무이네', '판티엣'],
  퀴논: ['퀴논', '뀌년'],
  빈증: ['빈증', '빈즈엉'],
  하이퐁: ['하이퐁'],
  껀터: ['껀터', '칸토'],
};

// ── 주제 사전 ────────────────────────────────────────────────
const TOPICS = {
  '맛집·음식': ['맛집', '식당', '레스토랑', '음식', '요리', '먹거리', '쌀국수', '반미', '분짜', '해산물', '한식', '뷔페', '미식'],
  '카페·디저트': ['카페', '커피', '디저트', '베이커리'],
  숙소: ['호텔', '리조트', '숙소', '호스텔', '빌라', '레지던스'],
  '관광·명소': ['관광', '명소', '가볼만', '여행지', '투어', '박물관', '사원', '해변', '비치', '폭포', '시장'],
  '교통·항공': ['항공', '비행기', '공항', '노선', '취항', '그랩', '택시', '기차', '교통'],
  '비자·서류': ['비자', '체류', '거주증', '노동허가', '여권', '입국', '출국', '세관'],
  '돈·환전': ['환전', '환율', '송금', '은행', '카드', '결제', '물가'],
  쇼핑: ['쇼핑', '마트', '기념품', '백화점', '아울렛'],
  골프: ['골프', '라운딩', '캐디', '그린피'],
  '건강·미용': ['마사지', '스파', '병원', '약국', '건강', '미용', '네일'],
  '문화·역사': ['역사', '문화', '축제', '전통', '설날', '민족', '풍습', '종교'],
};

const ago = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };
const ymd = (d) => d.toISOString().slice(0, 10);
const strip = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/&#\d+;/g, ' ');

/** 카테고리 묶음의 글을 전부 받는다 (제목·발췌까지 — 분류 근거로 쓴다) */
async function fetchPosts(ids) {
  const out = [];
  for (let page = 1; page <= 40; page++) {
    const url = `${WP}/posts?categories=${ids.join(',')}&per_page=100&page=${page}` +
                '&_fields=id,date,link,title,excerpt,categories';
    const r = await fetch(url);
    if (!r.ok) break;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

/** 사전으로 분류 */
function classify(text, dict) {
  const hits = [];
  for (const [label, words] of Object.entries(dict)) {
    if (words.some((w) => text.includes(w))) hits.push(label);
  }
  return hits;
}

async function gscByPage() {
  if (NO_GSC || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const c = await new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      credentials: { client_email: sa.client_email, private_key: sa.private_key },
      projectId: sa.project_id,
    }).getClient();
    const { token } = await c.getAccessToken();
    const r = await fetch(`${API}/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: ymd(ago(93)), endDate: ymd(ago(3)),
        dimensions: ['page'], rowLimit: 25000,
      }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = new Map();
    for (const row of (await r.json()).rows || []) m.set(row.keys[0].replace(/\/$/, ''), row);
    return m;
  } catch (e) {
    console.log(`  (서치콘솔 건너뜀: ${e.message})`);
    return null;
  }
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const rnum = (v, n) => String(Math.round(v || 0).toLocaleString('ko-KR')).padStart(n);

(async () => {
  console.log('■ 베트남 내부 콘텐츠 수집 중…');
  const seen = new Map();
  for (const [group, ids] of Object.entries(CATS)) {
    const rows = await fetchPosts(ids);
    for (const p of rows) {
      if (!seen.has(p.id)) seen.set(p.id, { ...p, groups: new Set() });
      seen.get(p.id).groups.add(group);
    }
    console.log(`   ${pad(group, 6)} ${rnum(rows.length, 5)}편`);
  }
  const posts = [...seen.values()];
  console.log(`   ─────────────────`);
  console.log(`   중복 제거 후 ${posts.length}편\n`);

  const gsc = await gscByPage();

  for (const p of posts) {
    const text = strip(p.title && p.title.rendered) + ' ' + strip(p.excerpt && p.excerpt.rendered);
    p.cities = classify(text, CITIES);
    p.topics = classify(text, TOPICS);
    p.year = p.date.slice(0, 4);
    const g = gsc && gsc.get(p.link.replace(/\/$/, ''));
    p.imp = g ? g.impressions : 0;
    p.clk = g ? g.clicks : 0;
    p.pos = g ? g.position : null;
  }

  const tally = (key) => {
    const m = {};
    for (const p of posts) {
      for (const k of p[key]) {
        m[k] = m[k] || { n: 0, imp: 0, clk: 0 };
        m[k].n++; m[k].imp += p.imp; m[k].clk += p.clk;
      }
    }
    return m;
  };

  const show = (title, m) => {
    console.log(`\n■ ${title}`);
    console.log(`   ${pad('구분', 12)}  글수    90일 노출     클릭`);
    for (const [k, v] of Object.entries(m).sort((a, b) => b[1].n - a[1].n)) {
      console.log(`   ${pad(k, 12)} ${rnum(v.n, 5)}편 ${rnum(v.imp, 10)} ${rnum(v.clk, 8)}`);
    }
  };

  show('도시별', tally('cities'));
  show('주제별', tally('topics'));

  const noCity = posts.filter((p) => !p.cities.length).length;
  const noTopic = posts.filter((p) => !p.topics.length).length;
  console.log(`\n   도시 미분류 ${noCity}편 (${Math.round(noCity / posts.length * 100)}%)` +
              ` · 주제 미분류 ${noTopic}편 (${Math.round(noTopic / posts.length * 100)}%)`);

  const covered = posts.filter((p) => p.imp > 0).length;
  console.log(`   검색 노출 있는 글 ${covered}편 (${Math.round(covered / posts.length * 100)}%)`);

  if (DETAIL) {
    console.log('\n■ 도시 × 주제 교차표 (글 수) — 허브를 어디에 세울지의 근거');
    const cityKeys = Object.keys(CITIES);
    const topicKeys = Object.keys(TOPICS);
    console.log('   ' + pad('', 8) + topicKeys.map((t) => pad(t, 7)).join(''));
    for (const c of cityKeys) {
      const tot = posts.filter((p) => p.cities.includes(c)).length;
      if (!tot) continue;
      const row = topicKeys.map((t) => {
        const n = posts.filter((p) => p.cities.includes(c) && p.topics.includes(t)).length;
        return pad(n || '·', 7);
      });
      console.log('   ' + pad(c, 8) + row.join('') + ` = ${tot}`);
    }
  }

  fs.mkdirSync('.tmp', { recursive: true });
  fs.writeFileSync('.tmp/content-map.json', JSON.stringify(posts.map((p) => ({
    id: p.id, date: p.date, link: p.link,
    title: strip(p.title && p.title.rendered).trim(),
    groups: [...p.groups], cities: p.cities, topics: p.topics,
    imp: p.imp, clk: p.clk, pos: p.pos,
  })), null, 1));
  console.log(`\n✔ .tmp/content-map.json 저장 (${posts.length}편)`);
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
