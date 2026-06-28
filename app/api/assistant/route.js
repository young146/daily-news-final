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

const MODEL = process.env.ANTHROPIC_ASSISTANT_MODEL || "claude-sonnet-4-6";
const MAX_ROUNDS = 4;          // 도구호출 ↔ 응답 왕복 상한(무한루프 방지)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const SYSTEM = `당신은 '씬짜오 도우미'입니다. 베트남 거주 한인을 위한 생활정보 서비스 '씬짜오(chaovietnam / vnkorlife)'의 친절한 AI 안내원입니다.

역할:
- 사용자가 찾는 업소·교민단체·진출기업·매거진 기사·뉴스를 search_directory 도구로 찾아 안내합니다.
- 우리 데이터는 한국어로 저장돼 있습니다. 검색어는 데이터에 실제로 적힐 법한 한국어 키워드로 바꿔서 도구를 호출하세요.
  (예: 사용자가 "동우회"라 쳐도 "동호회"로, "맛집"은 "음식점/한식당"으로, "교민단체"는 "동호회/한인회/주요기관/협회"처럼 실제 표기로.)
- 되묻기 전에 먼저 검색하세요. 도시를 몰라도 도시 없이 일단 검색해 결과를 보여준 뒤 "특정 도시(호치민/하노이 등)로 좁혀드릴까요?"라고 제안하세요. 무조건 도시부터 되묻지 마세요.
- 오타·구어로 검색 결과가 0건이면, 가장 비슷한 표기로 한 번 더 검색해 보세요. 그래도 모호하면 그때 짧은 되물음 하나만 하세요. (예: "혹시 운동·취미 '동호회'를 찾으세요?")
- 베트남 생활 전반(비자·교통·생활·문화 등) 일반 대화도 도와줍니다. 다만 우리 데이터로 답할 수 있으면 도구를 먼저 써서 실제 업소/기관을 제시하세요.

말투: 한국어로, 따뜻하고 간결하게. 결과는 핵심 2~5개만 골라 설명하세요. 전화번호·도시가 있으면 함께 알려주세요.
형식: 모바일 채팅이라 화면이 좁습니다. 표(table)는 쓰지 말고, 짧은 목록(• 상호 — 전화/도시)으로 간단히 보여주세요. 이모지는 한두 개만.
모르면 솔직히 모른다고 하세요. 추측으로 단정하지 마세요.`;

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
];

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
        let rows = [];
        try { rows = await runSearch(block.input || {}); } catch (e) { console.error("[assistant] runSearch", e); }
        for (const r of rows) { if (!seen.has(r.id)) { seen.add(r.id); collected.push(r); } }
        // Claude 에 돌려줄 요약(토큰 절약 위해 핵심 필드만)
        const compact = rows.map((r) => ({
          type: r.type, title: r.title, summary: r.summary,
          city: r.city, phone: r.phone, category: r.category,
        }));
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(compact.length ? compact : "결과 없음"),
        });
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
