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

    // 베트남 시간대 기준으로 오늘 날짜 가져오기 (먼저 계산)
    const now = new Date();
    const vietnamTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })
    );
    const today = new Date(
      vietnamTime.getFullYear(),
      vietnamTime.getMonth(),
      vietnamTime.getDate()
    );
    today.setHours(0, 0, 0, 0);

    const year = vietnamTime.getFullYear();
    const month = String(vietnamTime.getMonth() + 1).padStart(2, "0");
    const day = String(vietnamTime.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    console.log(`[CardNews API] Using date: ${dateStr} (Vietnam timezone)`);

    // 카드 뉴스 선택 전에 기존 카드 뉴스 초기화 (새로운 뉴스 발행 시 자동 초기화되지만, 여기서도 명시적으로 초기화)
    await prisma.newsItem.updateMany({
      where: { isCardNews: true },
      data: { isCardNews: false },
    });
    console.log(`[CardNews API] ✅ Cleared all isCardNews flags before selecting new ones`);

    // 발행 행위(batch) 기반: 가장 최근 발행된 뉴스들의 배치를 선택
    // 1. 가장 최근에 발행된 뉴스의 시간 찾기
    const latestPublished = await prisma.newsItem.findFirst({
      where: {
        status: 'PUBLISHED',
        publishedAt: { not: null }
      },
      orderBy: {
        publishedAt: 'desc'
      },
      select: {
        publishedAt: true
      }
    });

    if (!latestPublished) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "발행된 뉴스가 없습니다.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. 가장 최근 발행 시간 기준으로 ±30분 이내를 같은 배치로 간주
    const batchTime = new Date(latestPublished.publishedAt);
    const batchStartTime = new Date(batchTime.getTime() - 30 * 60 * 1000); // 30분 전
    const batchEndTime = new Date(batchTime.getTime() + 30 * 60 * 1000);   // 30분 후

    console.log(`[CardNews API] Latest batch time: ${batchTime.toISOString()}`);
    console.log(`[CardNews API] Batch window: ${batchStartTime.toISOString()} ~ ${batchEndTime.toISOString()}`);

    // 3. 이 배치 시간대에 발행된 탑뉴스 2개 선택
    const topNewsList = await prisma.newsItem.findMany({
      where: {
        isTopNews: true,
        status: 'PUBLISHED',
        publishedAt: {
          gte: batchStartTime,
          lte: batchEndTime
        }
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 2, // 탑뉴스 최대 2개
    });

    // 4. 이 배치 시간대에 발행된 일반 뉴스 3개 선택 (탑뉴스 제외)
    const topNewsIds = topNewsList.map(n => n.id);
    const cardNewsItems = await prisma.newsItem.findMany({
      where: {
        id: { notIn: topNewsIds },
        isTopNews: false,
        status: 'PUBLISHED',
        publishedAt: {
          gte: batchStartTime,
          lte: batchEndTime
        }
      },
      orderBy: {
        publishedAt: 'desc'
      },
      take: 3, // 일반 뉴스 3개
    });

    // 선택된 5개 뉴스에 isCardNews 플래그 설정
    const selectedNewsIds = [...topNewsList.map(n => n.id), ...cardNewsItems.map(n => n.id)];
    await prisma.newsItem.updateMany({
      where: { id: { in: selectedNewsIds } },
      data: { isCardNews: true },
    });
    console.log(`[CardNews API] ✅ Selected ${selectedNewsIds.length} news items for card news (Top: ${topNewsList.length}, Others: ${cardNewsItems.length})`);

    // 탑뉴스는 첫 번째 것 사용 (선택된 뉴스가 있으면 그것 사용)
    let topNews = null;
    if (body.topNewsId) {
      // 선택된 뉴스가 선택된 리스트에 있는지 확인
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
          error: "발행된 탑뉴스가 없습니다. 먼저 뉴스를 발행하고 탑뉴스를 지정해주세요.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const title = topNews.translatedTitle || topNews.title || "Daily News Card";

    // 2. 이미지가 업로드되지 않았으면 서버에서 생성
    // (이미 위에서 FormData 처리 완료, imageBuffer가 null이면 서버에서 생성)
    if (!imageBuffer) {
      console.log(
        "[CardNews API] No image uploaded, generating server-side..."
      );

      if (!topNews) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "No top news selected for auto-generation",
          }),
          { status: 400 }
        );
      }

      const weather = await getSeoulWeather();
      const rates = await getExchangeRates();

      const summary = topNews.translatedSummary || topNews.summary || "";
      
      // ✅ WordPress에 업로드된 이미지를 우선 사용 (이미 우리 서버에 있어 안전함)
      let imageUrl = topNews.wordpressImageUrl || topNews.imageUrl || "";

      console.log(`[CardNews API] Image source: ${
        topNews.wordpressImageUrl ? 'WordPress (uploaded)' : 
        topNews.imageUrl ? 'Original source' : 
        'None'
      }`);

      // WordPress 이미지가 있으면 검증 생략 (이미 우리 서버의 이미지)
      if (imageUrl && !topNews.wordpressImageUrl) {
        // 원본 이미지인 경우만 검증
        try {
          console.log(`[CardNews API] Testing original image access: ${imageUrl.substring(0, 60)}...`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃
          
          const imgResp = await fetch(imageUrl, { 
            method: "HEAD",  // GET 대신 HEAD로 더 빠르게 체크
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': topNews.originalUrl || 'https://chaovietnam.co.kr'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!imgResp.ok) {
            console.warn(
              `[CardNews API] Original image fetch failed (${imgResp.status}). Using gradient.`
            );
            imageUrl = "";
          } else {
            console.log("[CardNews API] Original image accessible");
          }
        } catch (e) {
          console.warn(
            "[CardNews API] Original image access error, using gradient:",
            e.message
          );
          imageUrl = "";
        }
      } else if (imageUrl) {
        console.log("[CardNews API] Using WordPress uploaded image (no validation needed)");
      }

      console.log(
        `[CardNews API] Final image URL: ${
          imageUrl ? imageUrl.substring(0, 60) + "..." : "gradient background"
        }`
      );

      // ... (keep existing image upload logic if needed, or simplify) ...
      // For brevity, skipping the re-upload of background image since we are generating

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
      // Vercel에서는 내부 요청이므로 절대 URL이 필요할 수 있음
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      
      const imageApiUrl = `${baseUrl}/api/generate-card-image?${params.toString()}`;
      console.log("[CardNews API] Fetching from:", imageApiUrl);

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
            signal: controller.signal,
            headers: {
              'Cache-Control': 'no-cache',
            },
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
              `API URL: ${imageApiUrl}. ` +
              `환경 변수 확인: NEXT_PUBLIC_BASE_URL=${process.env.NEXT_PUBLIC_BASE_URL || 'not set'}`
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

      const contentType = imageResponse.headers.get("content-type") || "";
      if (!contentType.includes("image/") && !contentType.includes("application/octet-stream")) {
        const errorText = await imageResponse.text().catch(() => "");
        console.error(`[CardNews API] Unexpected content type: ${contentType}`, errorText);
        throw new Error(
          `이미지 생성 API가 이미지가 아닌 응답을 반환했습니다 (${contentType}): ${errorText.substring(0, 200)}`
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
