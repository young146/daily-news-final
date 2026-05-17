import prisma from "@/lib/prisma";
import {
  publishCardNewsToWordPress,
  uploadImageToWordPress,
} from "@/lib/publisher";
import { getSeoulWeather, getExchangeRates } from "@/lib/external-data";
import { generateCardImageBuffer } from "@/lib/card-generator";
import fs from 'fs';
import path from 'path';

export const runtime = "nodejs";

export async function POST(request) {
  // 로그 기록을 위한 변수
  let currentTopNewsTitle = "알 수 없음";

  try {
    console.log("[CardNews API] Received publish request...");

    // 1. 시작 로그 기록
    await prisma.crawlerLog.create({
      data: {
        status: 'STARTED',
        message: '[카드뉴스] 카드 뉴스 발행 프로세스가 시작되었습니다.',
        itemsFound: 0
      }
    });

    // 환경 변수 검증 (초기 단계에서 확인)
    const requiredEnvVars = {
      WORDPRESS_APP_PASSWORD: process.env.WORDPRESS_APP_PASSWORD,
      WORDPRESS_USERNAME: process.env.WORDPRESS_USERNAME || "chaovietnam",
    };
    
    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);
    
    if (missingVars.length > 0) {
      const errorMsg = `필수 환경 변수가 설정되지 않았습니다: ${missingVars.join(", ")}`;
      console.error("[CardNews API] " + errorMsg);
      
      await prisma.crawlerLog.create({
        data: {
          status: 'FAILED',
          message: `[카드뉴스] 환경 변수 누락으로 중단: ${missingVars.join(", ")}`,
          errorDetails: JSON.stringify({ missingVars, time: new Date().toISOString() })
        }
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: `${errorMsg}. 관리자에게 문의해주세요.`,
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

    // 베트남 시간대(UTC+7) 기준으로 오늘 날짜 가져오기 (통일된 로직)
    const now = new Date();
    const vnDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // "YYYY-MM-DD"
    const today = new Date(`${vnDateStr}T00:00:00+07:00`);
    const dateStr = vnDateStr;
    console.log(`[CardNews API] Using date: ${dateStr} (Vietnam timezone)`);

    // isCardNews = true인 오늘 발행된 뉴스들 가져오기
    let topNewsList = await prisma.newsItem.findMany({
      where: {
        isTopNews: true,
        status: 'PUBLISHED',
        isCardNews: true, 
        publishedAt: { gte: today }, // ✅ 오늘 것만
      },
      orderBy: {
        publishedAt: 'desc'
      },
    });

    const topNewsIds = topNewsList.map(n => n.id);
    let cardNewsItems = await prisma.newsItem.findMany({
      where: {
        id: { notIn: topNewsIds },
        isTopNews: false,
        status: 'PUBLISHED',
        isCardNews: true,
        publishedAt: { gte: today }, // ✅ 오늘 것만
      },
      orderBy: {
        publishedAt: 'desc'
      },
    });

    // ⭐ [지능형 폴백] 선택된 뉴스가 하나도 없다면 오늘 발행된 뉴스 전체를 후보로 삼음
    if (topNewsList.length === 0 && cardNewsItems.length === 0) {
      console.log("[CardNews API] 선택된 뉴스가 없어 오늘 발행된 전체 뉴스를 후보로 사용합니다.");
      topNewsList = await prisma.newsItem.findMany({
        where: { isTopNews: true, status: 'PUBLISHED', publishedAt: { gte: today } },
        orderBy: { publishedAt: 'desc' },
        take: 2,
      });
      const fallbackTopIds = topNewsList.map(n => n.id);
      cardNewsItems = await prisma.newsItem.findMany({
        where: { id: { notIn: fallbackTopIds }, isTopNews: false, status: 'PUBLISHED', publishedAt: { gte: today } },
        orderBy: { publishedAt: 'desc' },
        take: 8,
      });
    }

    console.log(`[CardNews API] Found News: Top=${topNewsList.length}, Others=${cardNewsItems.length}`);

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
      const errorMsg = "발행된 카드 뉴스 대상이 없습니다.";
      await prisma.crawlerLog.create({
        data: {
          status: 'FAILED',
          message: `[카드뉴스] 실패: ${errorMsg}`,
        }
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `${errorMsg} 먼저 뉴스를 발행해주세요.`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    currentTopNewsTitle = topNews.translatedTitle || topNews.title || "Daily News Card";
    const title = currentTopNewsTitle;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/122b107d-03ae-4b48-9b30-1372e8e984b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4',location:'app/api/publish-card-news/route.js:165',message:'Selected top news before image generation',data:{topNewsId:topNews?.id,hasWordpressImage:!!topNews?.wordpressImageUrl,hasLocalImage:!!topNews?.localImagePath,useGradient:body.useGradient===true},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // 2. 이미지가 업로드되지 않았으면 서버에서 생성
    let finalImagePath = null;
    if (!imageBuffer) {
      console.log(
        "[CardNews API] No image uploaded, generating server-side..."
      );

      const weather = await getSeoulWeather();
      const rates = await getExchangeRates();

      const summary = topNews.translatedSummary || topNews.summary || "";
      
      // ✅ 로컬 이미지 경로 확인 및 생성
      let imagePath = topNews.localImagePath || null;
      
      console.log(`[CardNews API] 📸 이미지 선택:`);
      console.log(`  - 로컬 이미지 경로: ${topNews.localImagePath || '없음'}`);
      console.log(`  - WordPress 이미지 URL: ${topNews.wordpressImageUrl || '없음'}`);
      
      // 로컬 경로가 없으면 WordPress URL에서 다운로드해서 로컬에 저장
      if (!imagePath && topNews.wordpressImageUrl) {
        try {
          console.log(`[CardNews API] 📥 로컬 이미지가 없어서 WordPress에서 다운로드 중...`);
          
          const imageResponse = await fetch(topNews.wordpressImageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: AbortSignal.timeout(15000),
          });
          
          if (imageResponse.ok) {
            const imageArrayBuffer = await imageResponse.arrayBuffer();
            const imageBuffer = Buffer.from(imageArrayBuffer);
            
            // 로컬 저장 경로 생성
            const imagesDir = path.join(process.cwd(), 'public', 'images', 'news');
            if (!fs.existsSync(imagesDir)) {
              fs.mkdirSync(imagesDir, { recursive: true });
            }
            
            // 파일 확장자 추출
            const urlPath = new URL(topNews.wordpressImageUrl).pathname;
            const ext = path.extname(urlPath) || '.jpg';
            const filename = `${topNews.id}${ext}`;
            const localPath = path.join(imagesDir, filename);
            
            // 파일 저장
            fs.writeFileSync(localPath, imageBuffer);
            imagePath = `/images/news/${filename}`;
            
            console.log(`[CardNews API] ✅ 로컬 이미지 저장 완료: ${imagePath}`);
            
            // DB에 localImagePath 업데이트
            try {
              await prisma.newsItem.update({
                where: { id: topNews.id },
                data: { localImagePath: imagePath }
              });
              console.log(`[CardNews API] ✅ DB localImagePath 업데이트 완료`);
            } catch (dbError) {
              console.warn(`[CardNews API] ⚠️ DB 업데이트 실패 (무시됨): ${dbError.message}`);
            }
          } else {
            console.warn(`[CardNews API] ⚠️ 이미지 다운로드 실패: HTTP ${imageResponse.status}`);
          }
        } catch (error) {
          console.warn(`[CardNews API] ⚠️ 이미지 다운로드/저장 오류: ${error.message}`);
        }
      }
      
      // 최종 이미지 경로 (반드시 워드프레스 URL 사용)
      finalImagePath = topNews.wordpressImageUrl || imagePath || "";
      
      const weatherTemp = weather?.temp ?? "25";
      const usdRate = rates?.usdVnd?.toLocaleString() ?? "25,400";
      const krwRate = rates?.krwVnd?.toLocaleString() ?? "17.8";

      console.log("[CardNews API] Generating card image buffer directly using Canvas (WP source)...");
      try {
        imageBuffer = await generateCardImageBuffer({
          title,
          imageUrl: finalImagePath, // 워드프레스 이미지를 우선적으로 사용
          weatherTemp: String(weatherTemp),
          usdRate: String(usdRate),
          krwRate: String(krwRate),
        });

        if (!imageBuffer || imageBuffer.length === 0) {
          throw new Error("이미지 생성 실패: 빈 이미지 버퍼를 받았습니다.");
        }
        
        console.log("[CardNews API] ✅ Image buffer generated successfully, size:", imageBuffer.length, "bytes");
      } catch (genError) {
        console.error("[CardNews API] ❌ Image generation failed:", genError);
        throw new Error(`이미지 생성 실패: ${genError.message}`);
      }
    }

    // 4. Publish to WordPress
    console.log(`[CardNews API] Publishing to WordPress: ${title}`);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/122b107d-03ae-4b48-9b30-1372e8e984b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H8',location:'app/api/publish-card-news/route.js:327',message:'Calling publishCardNewsToWordPress',data:{bufferBytes:imageBuffer?.length||0,dateStr,titleSnippet:title?.slice?.(0,80)||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const result = await publishCardNewsToWordPress(imageBuffer, dateStr, {
      topNewsTitle: title,
      terminalUrl: "https://chaovietnam.co.kr/daily-news-terminal/",
    });

    // 5. 성공 로그 기록
    await prisma.crawlerLog.create({
      data: {
        status: 'SUCCESS',
        message: `[카드뉴스] 발행 성공: ${title.substring(0, 50)}...`,
        itemsFound: 1,
        errorDetails: JSON.stringify({
          imageUrl: result.imageUrl,
          terminalUrl: result.terminalUrl,
          time: new Date().toISOString()
        })
      }
    });

    // 6. 페이스북 자동 게시 (실패해도 카드뉴스 발행 성공은 보존)
    //    중복 방지: topNews.isSentSNS=true 면 스킵
    let facebookResult = null;
    if (!topNews.isSentSNS && process.env.PUBLISH_API_KEY && result.imageUrl) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://daily-news-final.vercel.app";
        const [selfR, adR] = await Promise.all([
          fetch(`${baseUrl}/api/promo-cards/active?kind=self`),
          fetch(`${baseUrl}/api/promo-cards/active?kind=ad`),
        ]);
        const selfCards = (await selfR.json()).cards || [];
        const adCards = (await adR.json()).cards || [];
        const promos = [...selfCards, ...adCards]
          .filter(c => c.imageUrl && c.linkUrl)
          .map(c => ({ imageUrl: c.imageUrl, title: c.title, linkUrl: c.linkUrl }));

        const fbBody = {
          news: {
            imageUrl: result.imageUrl,
            caption: `🗞 씬짜오 데일리뉴스 — ${dateStr}\n${title}\n오늘의 뉴스 전체 보기 ↓`,
            link: result.terminalUrl || "https://chaovietnam.co.kr/daily-news-terminal/",
          },
          promos,
        };

        const fbRes = await fetch(
          "https://asia-northeast3-chaovietnam-login.cloudfunctions.net/publishToFacebookPage",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.PUBLISH_API_KEY },
            body: JSON.stringify(fbBody),
          }
        );
        const fbData = await fbRes.json();
        if (fbData.ok) {
          facebookResult = { ok: true, postId: fbData.postId, permalink: fbData.permalink };
          await prisma.newsItem.update({
            where: { id: topNews.id },
            data: { isSentSNS: true },
          });
          console.log("[CardNews API] ✅ Facebook posted:", fbData.permalink);
        } else {
          facebookResult = { ok: false, error: fbData.error || "unknown" };
          console.warn("[CardNews API] ⚠️ Facebook post failed:", fbData.error);
        }
      } catch (fbErr) {
        facebookResult = { ok: false, error: fbErr.message };
        console.warn("[CardNews API] ⚠️ Facebook post error (non-blocking):", fbErr.message);
      }
    } else if (topNews.isSentSNS) {
      console.log("[CardNews API] Facebook skipped (already sent for this topNews)");
      facebookResult = { ok: false, skipped: "already_sent" };
    }

    return new Response(
      JSON.stringify({
        success: true,
        terminalUrl: result.terminalUrl,
        imageUrl: result.imageUrl,
        facebook: facebookResult,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CardNews API] Error:", error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/122b107d-03ae-4b48-9b30-1372e8e984b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H12',location:'app/api/publish-card-news/route.js:357',message:'Publish flow caught error',data:{error:error?.message||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // 6. 실패 로그 기록
    await prisma.crawlerLog.create({
      data: {
        status: 'FAILED',
        message: `[카드뉴스] 발행 실패: ${currentTopNewsTitle.substring(0, 50)}...`,
        errorDetails: JSON.stringify({
          error: error.message,
          stack: error.stack,
          time: new Date().toISOString()
        }, null, 2)
      }
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
