// ============================================================
// 씬짜오 AI 검색 도우미 — 대화형 검색 (Claude tool use)
// POST /api/assistant  { messages:[{role:'user'|'assistant', content:'...'}], lang? }
//   → Claude 가 사용자의 자연어를 이해해 search_directory 도구를 호출,
//     우리 통합 인덱스(SearchIndex)를 조회하고 결과를 대화로 안내.
//   → 오타/구어("동우회")도 알아서 보정("동호회"), 모호하면 되물음, 일반 대화도 가능.
// 앱·웹에서 호출하므로 CORS 허용. (번역기와 동일한 @anthropic-ai/sdk·ANTHROPIC_API_KEY 사용)
// ============================================================
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 도우미 모델. Haiku 4.5(최하위 티어)에서 Sonnet 5 로 올렸다 (2026-08-08).
// 이유: 이 도우미가 하는 일은 단순하지 않다 — 도구 2개 중 뭘 언제 쓸지 판단하고,
//       '업소의 구체 사실(도구만)' 과 '베트남 일반 지식(알아서 답)' 을 구분하고,
//       한국어로 자연스럽게 써야 한다. 작은 모델은 이런 미묘한 구분을 뭉갠다.
// 덤: 프롬프트 캐싱 최소 길이가 Haiku 4.5 는 4,096 토큰이라 우리 시스템 프롬프트로는
//     아예 캐시가 안 됐다. Sonnet 은 1,024 라 캐시가 가능해진다(아직 미적용).
// ⛔ 되돌리려면 코드 말고 환경변수로: ANTHROPIC_ASSISTANT_MODEL=claude-haiku-4-5
const MODEL = process.env.ANTHROPIC_ASSISTANT_MODEL || "claude-sonnet-5";
const MAX_ROUNDS = 4;          // 도구호출 ↔ 응답 왕복 상한(무한루프 방지)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// 구글 Places API (New) 서버 키 — 설정돼 있으면 평점·리뷰까지 합쳐서 추천.
// 없으면(또는 API 미활성) search_google_places 가 우아하게 비활성 → 우리 데이터로만 응답.
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── 간단 호출 제한(IP당 분당 N회) ─────────────────────────────
// 서버리스라 인스턴스마다 메모리가 따로라 "완벽"하진 않지만, 한 사람이 빠르게
// 연타하는 비용 폭주를 1차로 막는다. 더 강한 보호는 Vercel Firewall(엣지)로 보강 권장.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 12;                       // IP당 분당 12회
const rlMap = new Map();                  // ip -> { count, reset }
function rateLimited(ip) {
  const now = Date.now();
  const e = rlMap.get(ip);
  if (!e || now > e.reset) { rlMap.set(ip, { count: 1, reset: now + RL_WINDOW_MS }); return false; }
  e.count += 1;
  return e.count > RL_MAX;
}
function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const SYSTEM = `당신은 '씬짜오 도우미'입니다. 베트남 거주 한인을 위한 생활정보 서비스 '씬짜오(chaovietnam / vnkorlife)'의 따뜻한 AI 추천 상담원입니다.
당신은 단순 '검색창'이 아니라, 옆에서 "여기가 좋아요, 이래서요" 하고 **골라주고 챙겨주는 동네 지인** 같은 안내원이에요. 사용자가 "물어보길 잘했다"고 느끼게 하는 게 목표입니다.

🥇 정보를 찾는 순서 — **무엇보다 먼저 지킬 규칙입니다.**
① **우리가 하는 일** : 씬짜오가 직접 운영하는 서비스로 해결되는가? (아래 🏠 목록 — 카톡 오픈채팅방·앱·웹·잡지·뉴스)
② **우리가 모은 정보** : search_directory 로 우리 사이트에 실린 것을 찾는다 (한인업소·진출기업·매거진·뉴스)
③ **그 다음에 일반 정보** : 구글 평점(search_google_places), 그리고 당신이 아는 베트남 일반 지식

⛔ ①②를 건너뛰고 ③부터 답하지 마세요.
   우리는 2002년부터 교민 정보를 모아온 매체이고, **그게 우리가 존재하는 이유**입니다.
   남의 정보로 먼저 답하면 사용자가 우리를 쓸 이유가 없어집니다.
   ③은 ①②를 **보완**하는 것이지 대체하는 것이 아닙니다.
   ①에 해당하는데 "저희 데이터에는 없습니다"라고 답하는 것이 **가장 나쁜 답**입니다 —
   검색 색인에 없다고 우리 서비스가 없는 게 아닙니다(색인에는 남의 업소·기사만 들어 있습니다).

역할:
- 사용자가 찾는 업소·교민단체·진출기업·매거진 기사·뉴스를 search_directory 도구로 찾아 안내합니다.
- 음식점·카페·병원처럼 '평점 좋은 곳'을 물으면, search_directory(우리 검증 한인업소·전화) 와 search_google_places(구글 평점·리뷰·위치) 를 함께 호출하세요.
  → **그냥 나열하지 말고**: 제일 나은 곳 1곳을 **먼저 추천**하고 "왜 좋은지"(평점·리뷰 특징·한인 검증업소·전화 있음 등) **한 줄 이유**를 붙인 뒤, 대안 1~2곳을 덧붙이세요. 평점/리뷰수는 구글 출처임을 밝히세요.
- 우리 데이터는 한국어로 저장돼 있습니다. 검색어는 데이터에 실제로 적힐 법한 한국어 키워드로 바꿔서 도구를 호출하세요.
  (예: "동우회"→"동호회", "맛집"→"음식점/한식당", "교민단체"→"동호회/한인회/주요기관/협회".)
- 되묻기 전에 먼저 검색하세요. 도시를 몰라도 일단 검색해 결과를 보여준 뒤 "특정 도시로 좁혀드릴까요?"라고 제안하세요. 무조건 도시부터 되묻지 마세요.
- 검색 0건이면 가장 비슷한 표기로 한 번 더 검색. 그래도 모호하면 그때 짧은 되물음 하나만.
- **베트남 생활 일반 정보는 도구 없이도 아는 대로 먼저 답하세요.** 비자·체류·교통·환전·은행·통신·의료·자녀교육·주거·세금·노동·물가·날씨·명절·문화·관습·언어 등.
  "찾아볼까요?"로 미루지 마세요. **답을 먼저 주고**, 우리 데이터에 관련 업소·기사가 있으면 그때 도구로 찾아 덧붙입니다.
  (예: "비자 연장 어떻게 해?" → 연장 방법·필요서류·대략의 절차를 설명 → 그다음 search_directory("행정사")로 대행 업소를 곁들임)
- 정책·시사처럼 **최근 소식이 중요한 주제**는 search_directory(type:"news")로 우리 데일리뉴스를 찾아 근거로 붙이세요. 답이 최신이 되고 독자가 우리 기사로 이어집니다.

🎁 한 걸음 더 (고객을 다시 부르는 핵심):
답을 준 뒤, 사용자가 **미처 묻지 않았지만 알면 도움될 것**을 딱 **하나** 자연스럽게 곁들이세요. 예:
- "그 근처엔 한인 미용실도 여럿 있어요 — 찾아드릴까요?" (관련 업종을 제안)
- "이 병원은 한국어 진료가 된다고 돼 있어요." (데이터에 그렇게 적혀 있을 때만)
- 매거진·뉴스에 관련 정보가 있으면 "관련해서 씬짜오 매거진에 ○○ 글도 있어요." 처럼 우리 콘텐츠로 연결.
과하게 여러 개 붙이지 말고 **딱 하나**, 진짜 도움될 때만. 억지·영업 티는 금물.

⛔ 정직 규칙 (무엇보다 중요) — **두 가지를 구분하세요.**
① **특정 업소·기관의 구체 사실** (평점·전화·주소·영업시간·"한국어 가능" 등)
   → **도구가 실제로 준 것만** 말하세요. 지어내면 한 번에 신뢰를 잃습니다.
   → 도구에 없으면 "제 정보엔 없는데, 찾아볼까요?" 라고 솔직히. '한 걸음 더'도 이 규칙을 지킵니다.
② **베트남 생활 일반 지식** (제도·절차·관습·문화처럼 널리 알려진 것)
   → 아는 대로 답해도 됩니다. 이걸 ①처럼 막지 마세요 — 사용자가 가장 자주 묻는 것이 이쪽입니다.
   → 다만 **수수료·기간·필요서류·법규는 자주 바뀝니다.** 숫자를 말할 땐 "제가 아는 기준으로는",
     "변경될 수 있으니 관할 기관(출입국·영사관 등)에서 확인하세요"처럼 **확인 권고를 함께** 붙이세요.
   → 확실하지 않으면 단정하지 말고 "대체로 ~인데, 최근 바뀌었을 수 있어요"라고 하세요.

🏠 우리가 **직접 운영하는** 서비스 — 반드시 외우고 있어야 합니다
(출처: chao-vn-app 저장소의 BUSINESS_CONTEXT.md. 바뀌면 그쪽을 먼저 고치고 여기에 반영할 것)

⛔ 아래는 **검색 도구로 안 나옵니다.** 색인에는 '남의 업소·기사'만 있습니다.
   그러니 **"저희 데이터에는 없습니다"라고 답하기 전에 이 목록을 먼저 확인**하세요.
   우리가 직접 하는 서비스를 모른다고 답하는 것이 가장 나쁜 답입니다.

씬짜오베트남은 **2002년부터** 베트남 교민을 위해 격주 잡지를 내온 매체이고,
지금은 아래 디지털 서비스를 함께 운영합니다.

· **카카오톡 오픈채팅방 3개** — 교민들이 가장 많이 쓰는 입구입니다. 관련 질문이면 **꼭 함께** 안내하세요.
  - **씬짜오 당근/나눔** : 중고거래·나눔 ← "중고 물건 팔고 싶다/사고 싶다"는 **여기**
  - **씬짜오 구인구직** : 일자리·구인
  - **씬짜오 부동산** : 렌트·매매
  세 방 모두 앱·웹과 연동됩니다. 카카오톡에서 **방 이름 그대로 검색**하면 찾을 수 있다고 안내하세요.

· **씬짜오 베트남 앱** (iOS·안드로이드) — 위 세 가지가 게시판으로도 들어 있습니다
  탭: 매거진 · 뉴스 · 당근/나눔 · 구인구직 · 부동산 · 이웃사업(옐로페이지, 한인업소 3,700곳)
  받는 곳 — iOS https://apps.apple.com/app/id6754750793
           안드로이드 https://play.google.com/store/apps/details?id=com.yourname.chaovnapp

· **vnkorlife.com** — 당근·나눔 / 구인구직 / 부동산 / 옐로페이지 / 통합검색 (웹에서)
· **chaovietnam.co.kr** — 씬짜오 매거진(2002년 창간 교민 잡지) + 데일리 뉴스(매일 베트남 뉴스를 한국어로)
  데일리 뉴스는 **이메일 무료 구독**도 됩니다(구독자 약 7,000명)
· **오프라인** — 격주로 나오는 종이 잡지 『씬짜오』를 2002년부터 계속 발행하고 있습니다.
  지면 광고와 온라인 광고를 모두 취급합니다. 광고를 하고 싶다는 분께는 → https://chaovietnam.co.kr/ad-inquiry/

안내는 "카카오톡 '씬짜오 당근/나눔' 방이나 앱의 당근·나눔에서 하실 수 있어요" 처럼
**어디로 가면 되는지** 구체적으로. 앱을 안 쓰시는 것 같으면 받는 곳도 한 번 곁들이세요(매번은 말고).

🔎 도구는 반드시 쓰세요 (중요):
- **업소·기관·가게·기사를 찾는 질문이면 답하기 전에 search_directory 를 먼저 호출**하세요. 기억으로 답하지 마세요.
- 음식점·카페·병원처럼 '좋은 곳'을 묻는 질문이면 **search_google_places 도 함께** 호출하세요.
- 검색할지 말지 망설이지 말고 **일단 검색하세요.** 검색은 빠르고, 안 하면 틀린 답을 하게 됩니다.
- 반대로 순수한 일반 지식 질문(비자 절차·명절·문화 등)은 도구 없이 바로 답하고, 관련 업소·기사가 있을 때만 덧붙이세요.

말투: 한국어로, 따뜻하고 간결하게. 핵심 2~5개만.
길이: **짧게. 보통 3~5문장이면 충분합니다.** 길게 쓸수록 답이 늦게 도착하고(글자를 하나씩 만들어
내보내므로 길이가 곧 대기시간입니다) 모바일에서 읽기도 어렵습니다. 더 알고 싶으면 사용자가 다시 묻습니다.
형식: 모바일 채팅이라 화면이 좁습니다. 표(table) 쓰지 말고 짧은 목록(• 상호 — 전화/도시)으로. 이모지는 한두 개만.

⛔ 서비스 범위: 당신은 '베트남' 전문 도우미입니다.
- **베트남과 관련된 것은 넓게 도와주세요** — 생활·제도·문화·역사·경제·여행·언어·음식·지역까지. 한인 생활에 닿아 있으면 범위 안입니다.
- **완전히 무관한 것만** 거절하세요: 프로그래밍/코드, 숙제·논문·작문 대행, 범용 번역기·계산기, 베트남과 무관한 시사·연예·역할극.
거절 예시: "저는 베트남 생활을 도와드리는 도우미예요. 베트남에 관한 것이라면 무엇이든 물어보세요! 🙂"
⚠️ 범위를 좁게 잡아 되돌려보내지 마세요. 애매하면 **도와주는 쪽**을 택하세요.`;

const TOOLS = [
  {
    name: "search_directory",
    description:
      "씬짜오 통합 데이터에서 업소/교민단체/진출기업/매거진기사/뉴스를 검색한다. 사용자가 찾는 것을 가장 잘 나타내는 한국어 키워드로 호출하라. 결과가 비면 다른 키워드(동의어)로 다시 시도하라.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "검색 키워드(한국어). 데이터 표기에 맞춰 변환. 예: 동호회, 한인회, 한식당, 행정사, 미용실",
        },
        type: {
          type: "string",
          enum: ["yellow", "company", "magazine", "news"],
          description:
            "옐로페이지(업소·교민단체·동호회)=yellow, 진출기업=company, 매거진 기사=magazine, 데일리뉴스=news. 어떤 종류인지 모르면 생략(전체 검색).",
        },
        city: {
          type: "string",
          description: "도시 한글명으로 좁힐 때만. 예: 호치민, 하노이, 다낭, 붕따우",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_google_places",
    description:
      "구글 지도에서 장소(식당·카페·병원 등)를 평점·리뷰수·주소와 함께 검색한다. '평점 좋은', '맛집', '근처' 추천에 유용. 지역명을 query에 함께 넣으면 정확하다(예: '한국식당 호치민 2군'). search_directory(우리 검증업소)와 함께 쓰면 좋다.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "장소 검색어. 지역 포함 권장. 예: '한식당 호치민 2군', '한인 미용실 하노이'" },
      },
      required: ["query"],
    },
  },
];

// 구글 Places API (New) Text Search. 키 없거나 API 미활성이면 null 반환(봇은 우리 데이터로 폴백).
async function runPlaces({ query }) {
  if (!PLACES_KEY) return null;
  const q = String(query || "").trim();
  if (!q) return [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask":
          "places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.googleMapsUri,places.nationalPhoneNumber",
      },
      body: JSON.stringify({ textQuery: q, languageCode: "ko", regionCode: "VN" }),
    });
    if (!res.ok) { console.error("[assistant] places", res.status, (await res.text()).slice(0, 200)); return null; }
    const data = await res.json();
    return (data.places || []).slice(0, 8).map((p) => ({
      source: "google",
      title: (p.displayName && p.displayName.text) || "(이름없음)",
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? null,
      address: p.formattedAddress || null,
      phone: p.nationalPhoneNumber || null,
      url: p.googleMapsUri || null,
    }));
  } catch (e) { console.error("[assistant] places err", e.message); return null; }
}

// 도구 실행 — SearchIndex 직접 조회(통합검색 API와 같은 ILIKE+유사도 매칭).
// 옐로/진출기업을 기사보다 위로, 그다음 우선순위·유사도순. 최대 8건.
async function runSearch({ query, type, city }) {
  const q = String(query || "").trim();
  if (!q) return [];
  const conds = [Prisma.sql`("searchText" ILIKE ${"%" + q + "%"} OR similarity("searchText", ${q}) > 0.1)`];
  if (type) conds.push(Prisma.sql`type = ${type}`);
  if (city) conds.push(Prisma.sql`city = ${city}`);
  const where = Prisma.join(conds, " AND ");
  const rows = await prisma.$queryRaw`
    SELECT id, type, title, summary, url, phone, city, district, category
    FROM "SearchIndex"
    WHERE ${where}
    ORDER BY CASE type WHEN 'yellow' THEN 1 WHEN 'company' THEN 2 WHEN 'magazine' THEN 3 WHEN 'news' THEN 4 ELSE 5 END ASC,
             priority DESC, similarity("searchText", ${q}) DESC, "publishedAt" DESC NULLS LAST
    LIMIT 8`;
  return rows;
}

export async function POST(request) {
  // 호출 제한 — 너무 잦으면 잠시 막음(비용·남용 방지)
  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { reply: "잠시만요 🙏 요청이 너무 빨라요. 잠깐 후에 다시 시도해 주세요.", results: [] },
      { status: 429, headers: CORS }
    );
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  // 안전장치: 역할/내용 정규화 + 길이 제한(악용·비용 폭주 방지)
  const messages = incoming
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "no_user_message" }, { status: 400, headers: CORS });
  }

  const convo = [...messages];
  const collected = [];   // 화면 카드용으로 모은 검색 결과(중복 제거)
  const seen = new Set();

  try {
    let reply = "";
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await anthropic.messages.create({
        model: MODEL,
        // 생각(thinking) 끔 — 사장님 결정(2026-08-08).
        // 검색 도우미는 속도가 생명이고, 깊이 생각해야 할 질문이면 독자가 직접 AI 를 쓰면 된다.
        // ⚠️ Sonnet 5 는 thinking 이 **기본으로 켜져** 있어서 명시적으로 꺼야 한다.
        //    안 끄면 max_tokens 를 생각과 답변이 나눠 쓰다가 답이 잘린다.
        // ⚠️ 생각을 끄면 **도구를 덜 쓰는** 부작용이 있다(공식 문서 명시).
        //    그래서 SYSTEM 프롬프트에 '도구를 반드시 먼저 써라'를 못박아 뒀다. 둘은 한 쌍이다.
        thinking: { type: "disabled" },
        // 1024 → 2048. 이제 베트남 일반 정보까지 답하므로 예전보다 답이 길다.
        // (생각을 껐으므로 이 토큰은 전부 답변에 쓰인다)
        max_tokens: 2048,
        // 프롬프트 캐싱 — 응답이 느리던 가장 큰 원인을 없앤다.
        //
        // 한 번 검색에 모델을 최대 MAX_ROUNDS(4)번 부르는데, 그때마다 도구 정의 + 시스템
        // 프롬프트(합계 약 3,900자)를 **처음부터 다시 읽고 있었다.** 캐싱하면 2번째 왕복부터는
        // 그 부분을 다시 안 읽는다 → 응답 시작이 빨라지고 그 구간 비용도 1/10 로 떨어진다.
        // 5분 안에 다른 사용자가 검색해도 같은 캐시를 읽는다.
        //
        // 표시는 tools → system → messages 순이라, **system 마지막 블록에 표시 하나만** 달면
        // 도구 정의까지 함께 캐시된다.
        // ⚠️ 캐시는 앞부분이 한 글자만 달라도 깨진다. SYSTEM 이나 TOOLS 에 날짜·랜덤값 같은
        //    매번 바뀌는 값을 절대 넣지 말 것. (넣는 순간 캐시가 통째로 무효가 된다)
        // ※ Haiku 4.5 는 캐시 최소 길이가 4,096 토큰이라 이 프롬프트로는 캐시가 안 됐다.
        //   Sonnet 은 1,024 라 가능해진 것 — 모델을 올린 덕에 열린 문이다.
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        tools: TOOLS,
        messages: convo,
      });

      // 캐시가 실제로 먹는지 로그로 확인(Vercel logs). read 가 계속 0 이면 앞부분이 매번 바뀌는 것.
      if (res.usage) {
        const cw = res.usage.cache_creation_input_tokens || 0;
        const cr = res.usage.cache_read_input_tokens || 0;
        if (cw > 0 || cr > 0) console.log(`[assistant] cache write=${cw}, read=${cr}`);
      }

      // 이번 응답의 텍스트 모으기
      reply = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

      if (res.stop_reason !== "tool_use") break;   // 도구 안 쓰면 최종 답변

      // 도구 호출 처리
      convo.push({ role: "assistant", content: res.content });
      const toolResults = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        let compact;
        if (block.name === "search_google_places") {
          let places = null;
          try { places = await runPlaces(block.input || {}); } catch (e) { console.error("[assistant] runPlaces", e); }
          if (places === null) {
            compact = "구글 지도 검색 사용 불가(키 미설정/미활성) — 우리 데이터로만 안내하세요.";
          } else {
            for (const p of places) { const k = "g:" + (p.url || p.title); if (!seen.has(k)) { seen.add(k); collected.push(p); } }
            compact = places.length
              ? places.map((p) => ({ title: p.title, rating: p.rating, ratingCount: p.ratingCount, address: p.address, phone: p.phone, source: "google" }))
              : "구글 결과 없음";
          }
        } else {
          let rows = [];
          try { rows = await runSearch(block.input || {}); } catch (e) { console.error("[assistant] runSearch", e); }
          for (const r of rows) { if (!seen.has(r.id)) { seen.add(r.id); collected.push(r); } }
          compact = rows.length
            ? rows.map((r) => ({ type: r.type, title: r.title, summary: r.summary, city: r.city, phone: r.phone, category: r.category }))
            : "결과 없음";
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(compact) });
      }
      convo.push({ role: "user", content: toolResults });
    }

    return NextResponse.json(
      { reply: reply || "죄송해요, 잘 이해하지 못했어요. 무엇을 찾으시는지 한 번만 더 말씀해 주시겠어요?", results: collected },
      { headers: CORS }
    );
  } catch (e) {
    console.error("[/api/assistant] error:", e);
    return NextResponse.json(
      { error: "assistant_failed", message: e.message },
      { status: 500, headers: CORS }
    );
  }
}
