import prisma from "@/lib/prisma";
import {
  publishCardNewsToWordPress,
  uploadImageToWordPress,
} from "@/lib/publisher";
import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    console.log("[CardNews API] Received publish request...");

    // 환경 변수 검증 (초기 단계에서 확인)
    const requiredEnvVars = {
      WORDPRESS_APP_PASSWORD: process.env.WORDPRESS_APP_PASSWORD,
      WORDPRESS_USERNAME: process.env.WORDPRESS_USERNAME || "chaovietnam",
    };
    
    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);
    
    if (missingVars.length > 0) {
      console.error("[CardNews API] Missing environment variables:", missingVars);
      return new Response(
        JSON.stringify({
          success: false,
          error: `필수 환경 변수가 설정되지 않았습니다: ${missingVars.join(", ")}. 관리자에게 문의해주세요.`,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Content-Type 먼저 확인
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    let imageBuffer = null;

    // 요청 본문 파싱 (JSON 또는 FormData)
    if (contentType.includes("application/json")) {
      // JSON 요청인 경우
      body = await request.json();
      console.log("[CardNews API] Received JSON body:", body);
    } else if (contentType.includes("multipart/form-data")) {
      // FormData 요청인 경우 (이미지 업로드)
      console.log("[CardNews API] Handling multipart form data...");
      const formData = await request.formData();
      const file = formData.get("image");
      const topNewsIdParam = formData.get("topNewsId");

      if (file) {
        console.log("[CardNews API] Client uploaded image found.");
        const arrayBuffer = await file.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      }

      if (topNewsIdParam) {
        body.topNewsId = topNewsIdParam;
      }
    }

    // 베트남 시간대 기준으로 오늘 날짜 가져오기
    const now = new Date();
    const vietnamTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    );
    const year = vietnamTime.getFullYear();
    const month = String(vietnamTime.getMonth() + 1).padStart(2, "0");
    const day = String(vietnamTime.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    console.log(`[CardNews API] Using date: ${dateStr} (Vietnam timezone)`);

    // isCardNews = true인 뉴스들 가져오기
    const topNewsList = await prisma.newsItem.findMany({
      where: {
        isTopNews: true,
        status: 'PUBLISHED',
        isCardNews: true, // ✅ 카드 뉴스로 표시된 것만
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 2,
    });

    const topNewsIds = topNewsList.map(n => n.id);
    const cardNewsItems = await prisma.newsItem.findMany({
      where: {
        id: { notIn: topNewsIds },
        isTopNews: false,
        status: 'PUBLISHED',
        isCardNews: true, // ✅ 카드 뉴스로 표시된 것만
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 3,
    });

    console.log(`[CardNews API] Found isCardNews=true: Top=${topNewsList.length}, Others=${cardNewsItems.length}`);

    // 탑뉴스는 첫 번째 것 사용 (선택된 뉴스가 있으면 그것 사용)
    let topNews = null;
    if (body.topNewsId) {
      // 선택된 뉴스가 isCardNews = true 리스트에 있는지 확인
      const selectedNews = [...topNewsList, ...cardNewsItems].find(n => n.id === body.topNewsId);
      if (selectedNews && selectedNews.status === 'PUBLISHED') {
        topNews = selectedNews;
        console.log(`[CardNews API] ✅ Using selected top news: ${topNews.translatedTitle || topNews.title}`);
      }
    }
    
    // 선택된 뉴스가 없으면 첫 번째 탑뉴스 사용
    if (!topNews) {
      topNews = topNewsList.length > 0 ? topNewsList[0] : null;
      if (topNews) {
        console.log(`[CardNews API] ✅ Using default top news: ${topNews.translatedTitle || topNews.title}`);
      }
    }

    // 최종 검증
    if (!topNews) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "발행된 카드 뉴스 대상이 없습니다. 먼저 뉴스를 발행해주세요.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const title = topNews.translatedTitle || topNews.title || "Daily News Card";

    // 2. 이미지가 업로드되지 않았으면 서버에서 생성
    if (!imageBuffer) {
      console.log(
        "[CardNews API] No image uploaded, generating server-side..."
      );

      const weather = await getSeoulWeather();
      const rates = await getExchangeRates();

      const summary = topNews.translatedSummary || topNews.summary || "";
      
      // ✅ WordPress에 이미 업로드된 이미지만 사용 (외부 원본 URL 사용 금지)
      // 외부 URL은 CORS 문제 및 보안 문제로 @vercel/og에서 로드 실패 가능성이 매우 높음
      const imageUrl = topNews.wordpressImageUrl || "";
      
      console.log(`[CardNews API] 📸 이미지 선택 (DB 우선):`);
      console.log(`  - DB 내 WordPress 이미지 URL: ${topNews.wordpressImageUrl || '없음'}`);
      console.log(`  - 최종 사용 URL: ${imageUrl || '없음 (그라디언트 배경 예정)'}`);
      
      if (!imageUrl) {
        console.warn(`[CardNews API] ⚠️ WordPress 이미지가 DB에 없습니다. 그라디언트 배경을 사용합니다.`);
        console.warn(`[CardNews API] 💡 원본 이미지가 아닌, 이미 발행되어 WordPress에 올라간 이미지만 사용하도록 강제되었습니다.`);
      }

      const weatherTemp = weather?.temp ?? "25";
      const usdRate = rates?.usdVnd?.toLocaleString() ?? "25,400";
      const krwRate = rates?.krwVnd?.toLocaleString() ?? "17.8";

      const params = new URLSearchParams({
        title,
        summary,
        image: imageUrl,
        weather: String(weatherTemp),
        usd: String(usdRate),
        krw: String(krwRate),
      });

      // 내부 API 호출: 로컬에서는 localhost, 프로덕션에서는 절대 URL 사용
      // Vercel Deployment Protection(401)을 피하기 위해 가능한 경우 localhost를 우선 시도
      let baseUrl = "http://localhost:3000";
      
      if (process.env.NODE_ENV === "production") {
        if (process.env.NEXT_PUBLIC_BASE_URL) {
          baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
        } else if (process.env.VERCEL_URL) {
          baseUrl = `https://${process.env.VERCEL_URL}`;
        }
      }
      
      const imageApiUrl = `${baseUrl}/api/generate-card-image?${params.toString()}`;
      console.log("[CardNews API] Fetching from:", imageApiUrl);

      // Vercel Deployment Protection bypass header가 있으면 추가
      const fetchOptions = {
        headers: {
          'Cache-Control': 'no-cache',
        },
      };

      if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
        fetchOptions.headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      }

      // 타임아웃과 재시도 로직이 포함된 fetch
      let imageResponse;
      let lastError;
      const maxRetries = 2;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[CardNews API] Retry attempt ${attempt}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 지수 백오프
          }

          // AbortController로 타임아웃 설정 (30초)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          
          imageResponse = await fetch(imageApiUrl, {
            ...fetchOptions,
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          break; // 성공하면 루프 탈출
        } catch (error) {
          lastError = error;
          if (error.name === 'AbortError') {
            console.error(`[CardNews API] Request timeout (attempt ${attempt + 1})`);
          } else {
            console.error(`[CardNews API] Fetch error (attempt ${attempt + 1}):`, error.message);
          }
          
          if (attempt === maxRetries) {
            throw new Error(
              `이미지 생성 API 호출 실패 (${maxRetries + 1}회 시도): ${error.message}. ` +
              `API URL: ${imageApiUrl}. `
            );
          }
        }
      }

      console.log(
        `[CardNews API] Image generation response status: ${imageResponse.status}`
      );

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text().catch(() => "");
        console.error(`[CardNews API] Image generation failed:`, errorText);
        throw new Error(
          `이미지 생성 실패 (${imageResponse.status}): ${errorText.substring(
            0,
            200
          )}`
        );
      }

      const resContentType = imageResponse.headers.get("content-type") || "";
      if (!resContentType.includes("image/") && !resContentType.includes("application/octet-stream")) {
        const errorText = await imageResponse.text().catch(() => "");
        console.error(`[CardNews API] Unexpected content type: ${resContentType}`, errorText);
        throw new Error(
          `이미지 생성 API가 이미지가 아닌 응답을 반환했습니다 (${resContentType}): ${errorText.substring(0, 200)}`
        );
      }

      const ab = await imageResponse.arrayBuffer();
      if (!ab || ab.byteLength === 0) {
        throw new Error("이미지 생성 실패: 빈 이미지 버퍼를 받았습니다.");
      }
      imageBuffer = Buffer.from(ab);
      console.log(
        `[CardNews API] Image generated successfully: ${imageBuffer.length} bytes`
      );
    }

    console.log(`[CardNews API] Final Image Size: ${imageBuffer.length} bytes`);
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error("이미지 생성 실패: 이미지 버퍼가 비어있습니다.");
    }

    // 4. Publish to WordPress
    console.log(
      `[CardNews API] Publishing to WordPress with date: ${dateStr}, title: ${title}`
    );
    const result = await publishCardNewsToWordPress(imageBuffer, dateStr, {
      topNewsTitle: title,
      terminalUrl: "https://chaovietnam.co.kr/daily-news-terminal/",
    });

    console.log("[CardNews API] Success:", result);
    console.log(`[CardNews API] Published image URL: ${result.imageUrl}`);
    console.log(`[CardNews API] Terminal URL: ${result.terminalUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        terminalUrl: result.terminalUrl,
        imageUrl: result.imageUrl,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[CardNews API] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
