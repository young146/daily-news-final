import prisma from "@/lib/prisma";

export async function POST(request) {
  try {
    console.log('[Reset CardNews] Clearing all isCardNews flags...');
    
    // 모든 isCardNews 플래그를 false로 초기화
    const result = await prisma.newsItem.updateMany({
      where: { isCardNews: true },
      data: { isCardNews: false },
    });

    console.log(`[Reset CardNews] ✅ Cleared ${result.count} isCardNews flags`);

    return new Response(
      JSON.stringify({
        success: true,
        count: result.count,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[Reset CardNews] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

