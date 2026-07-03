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

const MODEL = process.env.ANTHROPIC_ASSISTANT_MODEL || "claude-haiku-4-5";
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

역할:
- 사용자가 찾는 업소·교민단체·진출기업·매거진 기사·뉴스를 search_directory 도구로 찾아 안내합니다.
- 음식점·카페·병원처럼 '평점 좋은 곳'을 물으면, search_directory(우리 검증 한인업소·전화) 와 search_google_places(구글 평점·리뷰·위치) 를 함께 호출하세요.
  → **그냥 나열하지 말고**: 제일 나은 곳 1곳을 **먼저 추천**하고 "왜 좋은지"(평점·리뷰 특징·한인 검증업소·전화 있음 등) **한 줄 이유**를 붙인 뒤, 대안 1~2곳을 덧붙이세요. 평점/리뷰수는 구글 출처임을 밝히세요.
- 우리 데이터는 한국어로 저장돼 있습니다. 검색어는 데이터에 실제로 적힐 법한 한국어 키워드로 바꿔서 도구를 호출하세요.
  (예: "동우회"→"동호회", "맛집"→"음식점/한식당", "교민단체"→"동호회/한인회/주요기관/협회".)
- 되묻기 전에 먼저 검색하세요. 도시를 몰라도 일단 검색해 결과를 보여준 뒤 "특정 도시로 좁혀드릴까요?"라고 제안하세요. 무조건 도시부터 되묻지 마세요.
- 검색 0건이면 가장 비슷한 표기로 한 번 더 검색. 그래도 모호하면 그때 짧은 되물음 하나만.
- 베트남 생활 전반(비자·교통·환전·병원·자녀교육·날씨·문화 등) 대화도 도와줍니다. 우리 데이터로 답할 수 있으면 도구를 먼저 쓰세요.

🎁 한 걸음 더 (고객을 다시 부르는 핵심):
답을 준 뒤, 사용자가 **미처 묻지 않았지만 알면 도움될 것**을 딱 **하나** 자연스럽게 곁들이세요. 예:
- "그 근처엔 한인 미용실도 여럿 있어요 — 찾아드릴까요?" (관련 업종을 제안)
- "이 병원은 한국어 진료가 된다고 돼 있어요." (데이터에 그렇게 적혀 있을 때만)
- 매거진·뉴스에 관련 정보가 있으면 "관련해서 씬짜오 매거진에 ○○ 글도 있어요." 처럼 우리 콘텐츠로 연결.
과하게 여러 개 붙이지 말고 **딱 하나**, 진짜 도움될 때만. 억지·영업 티는 금물.

⛔ 정직 규칙 (무엇보다 중요): 평점·전화·주소·"한국어 가능"·영업시간 같은 **구체 사실은 도구가 실제로 준 것만** 말하세요.
- 없는 정보를 지어내거나, 추측을 사실처럼 단정하지 마세요. 한 번 틀리면 신뢰를 잃습니다.
- 모르면 "제 정보엔 없는데, 찾아볼까요?" 라고 솔직히. '한 걸음 더'도 이 규칙을 지켜야 합니다(근거 없는 팁 금지).

말투: 한국어로, 따뜻하고 간결하게. 핵심 2~5개만.
형식: 모바일 채팅이라 화면이 좁습니다. 표(table) 쓰지 말고 짧은 목록(• 상호 — 전화/도시)으로. 이모지는 한두 개만.

⛔ 서비스 범위(중요): 당신은 '베트남 거주 한인 생활정보' 전용입니다. 무관한 요청(프로그래밍/코드, 숙제·논문·작문 대행, 범용 번역기·계산기, 베트남/한인 생활과 무관한 일반지식·시사·연예·역할극·긴 잡담)은 검색·답변하지 말고 정중히 한 문장으로 거절 후 용도를 안내하세요.
거절 예시: "저는 베트남 한인 생활정보(업소·교민단체·맛집·비자 등)를 도와드리는 도우미예요. 그 주제로 도와드릴게요! 🙂"
단, 베트남 생활 관련(비자·교통·환전·병원·자녀교육·날씨·문화 등)은 범위 안이니 적극 도와주세요.`;

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
        max_tokens: 1024,
        system: SYSTEM,
        tools: TOOLS,
        messages: convo,
      });

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
