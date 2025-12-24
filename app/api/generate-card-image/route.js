import { generateCardImageBuffer } from "@/lib/card-generator";

export const runtime = 'nodejs';

export async function GET(request) {
  // Vercel Protection Bypass 헤더 확인 (내부 API 호출 검증)
  const bypassSecret = request.headers.get('x-vercel-protection-bypass');
  const expectedSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  
  // 프로덕션 환경에서만 검증 (개발 환경에서는 생략)
  if (process.env.NODE_ENV === "production" && expectedSecret) {
    if (!bypassSecret || bypassSecret !== expectedSecret) {
      console.warn("[CardImage] Missing or invalid bypass secret");
      return new Response(
        JSON.stringify({
          error: "Authentication Required",
          message: "This API requires authentication for internal calls"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  const { searchParams } = new URL(request.url);

  const title = searchParams.get("title") || "오늘의 뉴스";
  const imageUrl = searchParams.get("image") || "";
  const weatherTemp = searchParams.get("weather") || "--";
  const usdRate = searchParams.get("usd") || "--";
  const krwRate = searchParams.get("krw") || "--";
  const useGradient = searchParams.get("useGradient") === "true";

  try {
    const pngBuffer = await generateCardImageBuffer({
      title,
      imageUrl,
      weatherTemp,
      usdRate,
      krwRate,
      useGradient
    });

    console.log("[CardImage API] ✅ Image generated successfully, size:", pngBuffer.length, "bytes");

    return new Response(pngBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("[CardImage API] Generation error:", e);
    return new Response(
      JSON.stringify({
        error: "이미지 생성 실패",
        details: e.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
