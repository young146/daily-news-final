const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const WP_URL = process.env.WORDPRESS_URL || "https://chaovietnam.co.kr";
const WP_USER = process.env.WORDPRESS_USERNAME || "chaovietnam";
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

// Hosts that need special SSL handling (downloaded via Replit first)
const SSL_PROBLEM_HOSTS = [
  "img3.yna.co.kr",
  "img.yna.co.kr",
  "yna.co.kr",
  "vnanet.vn",
];

/**
 * Downloads image from URL using Replit server (for SSL problem hosts like Yonhap)
 * @param {string} imageUrl - The source image URL
 * @returns {Promise<Buffer|null>} - Image data as Buffer or null if failed
 */
async function downloadImageViaReplit(imageUrl) {
  return new Promise((resolve) => {
    const agent = new https.Agent({
      rejectUnauthorized: false,
      secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    });

    const parsedUrl = new URL(imageUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      agent: agent,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: `${parsedUrl.protocol}//${parsedUrl.hostname}/`,
      },
    };

    https
      .get(options, (res) => {
        if (res.statusCode !== 200) {
          console.log(`[Image] Replit download failed: HTTP ${res.statusCode}`);
          resolve(null);
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          console.log(
            `[Image] Replit download success: ${buffer.length} bytes`
          );
          resolve(buffer);
        });
      })
      .on("error", (e) => {
        console.log(`[Image] Replit download error: ${e.message}`);
        resolve(null);
      });
  });
}

/**
 * Uploads image directly to WordPress media library (for SSL problem hosts)
 * @param {Buffer} imageBuffer - Image data
 * @param {string} filename - Filename for the image
 * @returns {Promise<{id: number, url: string}|null>}
 */
async function uploadImageDirectly(imageBuffer, filename) {
  try {
    const auth = getWPAuth();

    const response = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          filename
        )}.jpg"`,
        "Content-Type": "image/jpeg",
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(
        `[Image] Direct upload failed:`,
        errorData.message || response.status
      );
      return null;
    }

    const result = await response.json();
    console.log(`[Image] ✅ Direct upload success! ID: ${result.id}`);
    return {
      id: result.id,
      url: result.source_url,
    };
  } catch (error) {
    console.error(`[Image] Direct upload error:`, error.message);
    return null;
  }
}

/**
 * Checks if URL is from a host with SSL problems
 */
function isSSLProblemHost(url) {
  try {
    const hostname = new URL(url).hostname;
    return SSL_PROBLEM_HOSTS.some((h) => hostname.includes(h));
  } catch {
    return false;
  }
}

/**
 * Uploads an image to WordPress using the custom XinChao endpoint.
 * For SSL problem hosts (Yonhap), downloads via Replit first then uploads directly.
 * Also saves the image locally to public/images/news/ folder.
 * @param {string} imageUrl - The source image URL
 * @param {string} title - Title for the image
 * @param {string} newsId - News item ID for local file naming (optional)
 * @returns {Promise<{id: number, url: string, localPath?: string}|null>} - WordPress media info or null if failed
 */
export async function uploadImageToWordPress(imageUrl, title, newsId = null) {
  if (!imageUrl || !WP_PASSWORD) return null;

  let imageBuffer = null;

  // Check if this is a SSL problem host (like Yonhap)
  if (isSSLProblemHost(imageUrl)) {
    console.log(
      `[Image] SSL problem host detected, downloading via Replit first...`
    );
    imageBuffer = await downloadImageViaReplit(imageUrl);
    if (imageBuffer) {
      const result = await uploadImageDirectly(imageBuffer, title);
      // ✅ 로컬에도 저장
      if (result && newsId) {
        const localPath = await saveImageLocally(imageBuffer, newsId);
        if (localPath) {
          result.localPath = localPath;
        }
      }
      return result;
    }
    console.log(`[Image] Replit download failed, skipping image`);
    return null;
  }

  console.log(
    `[Image] Requesting WordPress to download: ${imageUrl.substring(0, 60)}...`
  );

  try {
    const auth = getWPAuth();

    // Use custom XinChao endpoint that downloads image server-side
    const response = await fetch(`${WP_URL}/wp-json/xinchao/v1/upload-image`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: imageUrl,
        title: title,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(
        `[Image] Upload failed:`,
        errorData.message || response.status
      );
      return null;
    }

    const result = await response.json();

    if (result.success) {
      console.log(`[Image] ✅ Upload success! ID: ${result.attachment_id}`);
      console.log(`[Image] URL: ${result.url}`);
      
      // ✅ WordPress에서 업로드된 이미지를 다운로드해서 로컬에 저장
      // ⛔ Vercel/serverless 환경은 read-only filesystem이라 로컬 저장 불가 → fetch 자체를 skip
      //    (1건당 약 1~3초 절약, 30개 일괄 발행 시 30~90초 절약)
      const isReadOnlyFs = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
      if (newsId && !isReadOnlyFs) {
        try {
          const imageResponse = await fetch(result.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: AbortSignal.timeout(10000),
          });

          if (imageResponse.ok) {
            const imageArrayBuffer = await imageResponse.arrayBuffer();
            imageBuffer = Buffer.from(imageArrayBuffer);
            const localPath = await saveImageLocally(imageBuffer, newsId);
            if (localPath) {
              result.localPath = localPath;
            }
          }
        } catch (error) {
          console.warn(`[Image] Failed to download for local save: ${error.message}`);
        }
      }
      
      return {
        id: result.attachment_id,
        url: result.url,
        localPath: result.localPath || null,
      };
    } else {
      console.log(`[Image] Upload returned error:`, result);
      return null;
    }
  } catch (error) {
    console.error(`[Image] Error:`, error.message);
    return null;
  }
}

/**
 * Saves image buffer to local public/images/news/ folder
 * @param {Buffer} imageBuffer - Image data buffer
 * @param {string} newsId - News item ID for filename
 * @returns {Promise<string|null>} - Local file path (e.g., /images/news/{newsId}.jpg) or null if failed
 */
async function saveImageLocally(imageBuffer, newsId) {
  // ⛔ Vercel/serverless 환경은 filesystem이 read-only (/var/task) → 항상 EROFS 에러.
  //    시도조차 하지 않고 null 반환하여 로그 잡음 제거. 로컬 dev 환경에서는 그대로 동작.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return null;
  }
  try {
    const imagesDir = path.join(process.cwd(), 'public', 'images', 'news');
    // 디렉토리 생성 (없으면)
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // 파일 확장자 추정 (JPEG로 기본 설정)
    const filename = `${newsId}.jpg`;
    const localPath = path.join(imagesDir, filename);

    // 파일 저장
    fs.writeFileSync(localPath, imageBuffer);
    const publicPath = `/images/news/${filename}`;
    console.log(`[Image] ✅ Saved locally: ${publicPath}`);
    return publicPath;
  } catch (error) {
    console.warn(`[Image] Failed to save locally: ${error.message}`);
    return null;
  }
}

/**
 * Helper to fetch WP Category ID by name/slug
 */
async function getCategoryId(categoryName) {
  return [6, 31];
}

/**
 * Sanitizes string for WordPress to prevent DB errors
 */
function sanitizeForWordPress(str) {
  if (!str) return "";
  // 1. Remove 4-byte characters (emojis) which cause db_insert_error in non-utf8mb4 DBs
  // Matching surrogate pairs
  str = str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");

  // 2. Ensure it's not too long (safe limit for LONGTEXT is huge, but let's be safe for API)
  if (str.length > 200000) {
    console.warn("[Publish] Content too long, truncating...");
    return str.substring(0, 200000) + "... (truncated)";
  }
  return str;
}

/**
 * Generates the HTML for source attribution with styling
 */
function generateSourceAttribution(item) {
  // 베트남 시간대 기준으로 날짜 포맷
  let dateStr;
  if (item.publishedAt) {
    const pubDate = new Date(item.publishedAt);
    dateStr = pubDate.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
  } else {
    const now = new Date();
    dateStr = now.toLocaleDateString("ko-KR", { timeZone: "Asia/Ho_Chi_Minh" });
  }
  const sourceName = item.source || "Unknown";

  return `
<style>
.news-source-header {
    margin-bottom: 16px;
    font-size: 14px;
    line-height: 1.6;
}
.news-source-line {
    display: block;
    margin-bottom: 4px;
}
.news-source-header a {
    color: #111827;
    text-decoration: none;
}
.news-source-header a:hover {
    color: #ea580c;
    text-decoration: underline;
}
</style>
<div class="news-source-header">
    <div class="news-source-line">출처: ${sourceName}</div>
    <div class="news-source-line">날짜: ${dateStr}</div>
    ${
      item.originalUrl
        ? `<div class="news-source-line"><a href="${item.originalUrl}" target="_blank" rel="noopener noreferrer">원문보기</a></div>`
        : ""
    }
</div>`;
}

/**
 * Helper to generate WP Basic Auth Header
 */
function getWPAuth() {
  if (!WP_PASSWORD) throw new Error("WordPress App Password is not configured");
  return Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");
}

/**
 * Publishes content to the main site (chaovietnam.co.kr > 뉴스 > 데일리뉴스).
 * @param {object} item - News item to publish
 * @returns {Promise<{postUrl: string, imageUrl: string|null, mediaId: number|null}>} - The URL of the published post, uploaded image URL, and media ID
 */
export async function publishToMainSite(item) {
  console.log(`[Publish] Publishing to Main Site: ${item.title}`);

  try {
    // 중복 게시 방지: 이미 WordPress에 게시된 경우 기존 URL 반환
    // 단, atomic claim 의 sentinel('__PUBLISHING__')은 아직 발행되지 않은 상태이므로 가드에서 제외
    if (item.wordpressUrl && item.wordpressUrl !== '__PUBLISHING__') {
      console.log(`[Publish] ⚠️ 이미 게시된 뉴스입니다. 기존 URL 반환: ${item.wordpressUrl}`);
      return {
        postUrl: item.wordpressUrl,
        imageUrl: item.wordpressImageUrl || null,
        mediaId: item.wordpressMediaId || null,
        localImagePath: item.localImagePath || null,
      };
    }

    const auth = getWPAuth();
    const categoryIds = await getCategoryId(item.category);

    let finalContent =
      item.translatedContent || item.content || item.summary || "";
    let featuredMediaId = null;
    let uploadedImageUrl = null;
    let localImagePath = null;

    // Featured Image가 있으면 본문의 첫 번째 이미지만 제거 (중복 방지)
    if (item.imageUrl) {
      // 본문 시작 부분의 첫 번째 img 태그만 제거
      finalContent = finalContent.replace(/^\s*(<p[^>]*>)?\s*<img[^>]*>\s*(<\/p>)?/i, '');
      // figure로 감싸진 첫 번째 이미지도 제거
      finalContent = finalContent.replace(/^\s*<figure[^>]*>[\s\S]*?<\/figure>\s*/i, '');
    }

    // 본문에서 원문 URL 제거 (텍스트로 나타나는 URL 제거)
    if (item.originalUrl) {
      // URL을 다양한 형식으로 제거
      finalContent = finalContent.replace(new RegExp(item.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
      // "원문 | URL" 또는 "원문: URL" 형식 제거
      finalContent = finalContent.replace(new RegExp(`원문\\s*[|:]\\s*${item.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '');
      // "original URL" 또는 "original url" 텍스트와 함께 나타나는 URL 제거
      finalContent = finalContent.replace(new RegExp(`original\\s+url\\s*[|:]?\\s*${item.originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '');
      // 일반적인 URL 패턴 제거 (http:// 또는 https://로 시작)
      finalContent = finalContent.replace(/https?:\/\/[^\s]+/gi, '');
    }

    // Add source attribution at the top (before image)
    const sourceAttribution = generateSourceAttribution(item);

    finalContent = sourceAttribution + finalContent;

    // Upload image to WordPress if available
    if (item.imageUrl) {
      const uploadResult = await uploadImageToWordPress(
        item.imageUrl,
        item.translatedTitle || item.title,
        item.id // ✅ newsId 전달
      );

      if (uploadResult) {
        // Add image to content
        const imageHtml = `<img src="${uploadResult.url}" alt="${
          item.translatedTitle || item.title
        }" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
        finalContent = imageHtml + finalContent;
        featuredMediaId = uploadResult.id;
        uploadedImageUrl = uploadResult.url;
        localImagePath = uploadResult.localPath || null;
      }
    }

    const excerptText = sanitizeForWordPress(item.translatedSummary || item.summary || "");
    console.log(`[Publish] Setting excerpt (length: ${excerptText.length}): ${excerptText.substring(0, 100)}...`);
    
    const postData = {
      title: sanitizeForWordPress(item.translatedTitle || item.title),
      content: sanitizeForWordPress(finalContent),
      excerpt: excerptText, // 요약문을 excerpt로 저장
      status: "publish",
      categories: categoryIds,
      meta: {},
    };

    // Set featured image if uploaded
    if (featuredMediaId) {
      postData.featured_media = featuredMediaId;
    }

    // Store news category as custom field (for Jenny plugin badge display)
    if (item.category) {
      postData.meta.news_category = item.category;
      console.log(`[Publish] Setting news category: ${item.category}`);
    }
    // Store top news flag for Jenny plugin (expects is_top_news meta)
    // 명시적으로 isTopNews 값 확인 및 저장
    const isTopNewsValue =
      item.isTopNews === true ||
      item.isTopNews === "true" ||
      item.isTopNews === 1 ||
      item.isTopNews === "1";
    postData.meta.is_top_news = isTopNewsValue ? "1" : "0";
    console.log(
      `[Publish] Setting is_top_news: ${
        postData.meta.is_top_news
      } (from item.isTopNews: ${
        item.isTopNews
      }, type: ${typeof item.isTopNews})`
    );
    // Store source and original URL for Jenny plugin meta line / source
    if (item.source) {
      postData.meta.news_source = item.source;
      console.log(`[Publish] Setting news_source: ${item.source}`);
    }
    if (item.originalUrl) {
      // Jenny plugin expects news_original_url
      postData.meta.news_original_url = item.originalUrl;
      console.log(`[Publish] Setting news_original_url`);
    }
    // 요약문을 커스텀 필드로도 저장 (excerpt 필드가 저장되지 않을 경우 대비)
    if (excerptText) {
      postData.meta.news_summary = excerptText;
      console.log(`[Publish] Setting news_summary (custom field): ${excerptText.substring(0, 50)}...`);
    }

    const response = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.message || JSON.stringify(errorData);
      throw new Error(`WordPress API Error: ${errorMessage}`);
    }

    const newPost = await response.json();
    console.log(`[Publish] Success! Link: ${newPost.link}`);

    // Return post URL, uploaded image URL, media ID, and local image path
    return {
      postUrl: newPost.link,
      imageUrl: uploadedImageUrl,
      mediaId: featuredMediaId,
      localImagePath: localImagePath,
    };
  } catch (error) {
    console.error("[Publish] Failed to publish to Main Site:", error);
    throw error;
  }
}

/**
 * Publishes SUMMARY content to WordPress (뉴스 > 데일리뉴스 요약본).
 * Category IDs: 6 (뉴스), 711 (데일리뉴스 요약본)
 * If wordpressImageUrl/wordpressMediaId is available, reuses it for featured image.
 * @param {object} item - News item to publish
 * @returns {Promise<string>} - The URL of the published summary post
 */
export async function publishToDailySite(item) {
  console.log(
    `[Publish] Publishing Summary to Daily News Summary: ${item.title}`
  );

  try {
    const auth = getWPAuth();

    // Category IDs for "뉴스 > 데일리뉴스 요약본"
    const categoryIds = [6, 711];

    // Use SUMMARY content (not full content)
    // Also add source attribution here for consistency
    const sourceAttribution = generateSourceAttribution(item);
    let summaryContent =
      sourceAttribution + (item.translatedSummary || item.summary || "");
    let featuredMediaId = item.wordpressMediaId || null;

    // Check if we already have an uploaded image URL from the main article
    if (item.wordpressImageUrl) {
      // Reuse the already uploaded image - no need to upload again!
      console.log(
        `[Publish] Reusing already uploaded image: ${item.wordpressImageUrl}`
      );
      const imageHtml = `<img src="${item.wordpressImageUrl}" alt="${
        item.translatedTitle || item.title
      }" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
      summaryContent = imageHtml + `<p>${summaryContent}</p>`;
    } else if (item.imageUrl) {
      // Fallback: Upload image if no WordPress URL exists
      console.log(`[Publish] No cached image, uploading fresh...`);
      const uploadResult = await uploadImageToWordPress(
        item.imageUrl,
        item.translatedTitle || item.title,
        item.id // ✅ newsId 전달
      );

      if (uploadResult) {
        const imageHtml = `<img src="${uploadResult.url}" alt="${
          item.translatedTitle || item.title
        }" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
        summaryContent = imageHtml + `<p>${summaryContent}</p>`;
        featuredMediaId = uploadResult.id;
      } else {
        summaryContent = `<p>${summaryContent}</p>`;
      }
    } else {
      summaryContent = `<p>${summaryContent}</p>`;
    }

    // Add link to full article if available
    if (item.wordpressUrl) {
      summaryContent += `<p><a href="${item.wordpressUrl}" target="_blank">전체 기사 보기 →</a></p>`;
    }

    const postData = {
      title: item.translatedTitle || item.title,
      content: summaryContent,
      status: "publish",
      categories: categoryIds,
      meta: {},
    };

    // Set featured image using reused media ID (for Jenny Daily News plugin)
    if (featuredMediaId) {
      postData.featured_media = featuredMediaId;
      console.log(
        `[Publish] Setting featured image with media ID: ${featuredMediaId}`
      );
    }

    // Store full article URL as custom field (for Jenny plugin direct link)
    if (item.wordpressUrl) {
      postData.meta.full_article_url = item.wordpressUrl;
      console.log(`[Publish] Setting full article URL: ${item.wordpressUrl}`);
    }

    // Store news category as custom field (for Jenny plugin badge display)
    if (item.category) {
      postData.meta.news_category = item.category;
      console.log(`[Publish] Setting news category: ${item.category}`);
    }

    const response = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`WordPress API Error: ${JSON.stringify(errorData)}`);
    }

    const newPost = await response.json();
    console.log(`[Publish] Summary published! Link: ${newPost.link}`);
    return newPost.link;
  } catch (error) {
    console.error("[Publish] Failed to publish summary:", error);
    throw error;
  }
}

/**
 * Publishes Card News (전령 카드) image to WordPress.
 * Updates the Featured Image of the News Terminal page.
 * @param {Buffer} imageBuffer - PNG image data
 * @param {string} date - Date string for filename
 * @param {object} options - Options including terminalPageId
 * @returns {Promise<{terminalUrl: string, imageUrl: string}>}
 */
// WordPress API 호출을 위한 재시도 헬퍼 함수
async function fetchWithRetry(url, options, maxRetries = 2, operationName = "API call") {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 1000 * attempt; // 지수 백오프
        console.log(`[CardNews] Retrying ${operationName} (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // AbortController로 타임아웃 설정 (60초)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      lastError = error;
      if (error.name === 'AbortError') {
        console.error(`[CardNews] ${operationName} timeout (attempt ${attempt + 1})`);
      } else {
        console.error(`[CardNews] ${operationName} error (attempt ${attempt + 1}):`, error.message);
      }
      
      if (attempt === maxRetries) {
        throw new Error(
          `${operationName} 실패 (${maxRetries + 1}회 시도): ${error.message}`
        );
      }
    }
  }
  
  throw lastError;
}

export async function publishCardNewsToWordPress(
  imageBuffer,
  date,
  options = {}
) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/122b107d-03ae-4b48-9b30-1372e8e984b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H9',location:'lib/publisher.js:633',message:'Enter publishCardNewsToWordPress',data:{bufferBytes:imageBuffer?.length||0,date},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  console.log(`[CardNews] Updating News Terminal Featured Image...`);
  console.log(`[CardNews] Date parameter: ${date}`);
  console.log(
    `[CardNews] Image buffer size: ${imageBuffer?.length || 0} bytes`
  );

  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error("이미지 버퍼가 비어있습니다.");
  }

  // 환경 변수 검증
  if (!process.env.WORDPRESS_APP_PASSWORD) {
    throw new Error(
      "WordPress 환경 변수가 설정되지 않았습니다. WORDPRESS_APP_PASSWORD를 확인해주세요."
    );
  }

  try {
    const auth = getWPAuth();
    if (!auth) {
      throw new Error("WordPress 인증 정보를 가져올 수 없습니다.");
    }

    // 1. Upload the image to WordPress media library (PNG format from @vercel/og)
    const filename = `daily-news-card-${date}`;
    console.log(`[CardNews] Uploading image with filename: ${filename}.png`);

    const uploadResponse = await fetchWithRetry(
      `${WP_URL}/wp-json/wp/v2/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Disposition": `attachment; filename="${filename}.png"`,
          "Content-Type": "image/png",
        },
        body: imageBuffer,
      },
      2,
      "이미지 업로드"
    );

    const uploadContentType = uploadResponse.headers.get("content-type") || "";
    if (!uploadResponse.ok) {
      const errorPayload = uploadContentType.includes("application/json")
        ? await uploadResponse.json().catch(() => ({}))
        : await uploadResponse.text().catch(() => "");
      console.error(`[CardNews] Image upload failed:`, errorPayload);
      
      let errorMessage = `이미지 업로드 실패 (${uploadResponse.status})`;
      if (uploadResponse.status === 401) {
        errorMessage += ": WordPress 인증 실패. WORDPRESS_USERNAME과 WORDPRESS_APP_PASSWORD를 확인해주세요.";
      } else if (uploadResponse.status === 403) {
        errorMessage += ": WordPress 권한 없음. 사용자 계정에 미디어 업로드 권한이 있는지 확인해주세요.";
      } else if (errorPayload?.message) {
        errorMessage += `: ${errorPayload.message}`;
      } else if (typeof errorPayload === 'string') {
        errorMessage += `: ${errorPayload.substring(0, 200)}`;
      }
      
      throw new Error(errorMessage);
    }
    
    if (!uploadContentType.includes("application/json")) {
      const raw = await uploadResponse.text().catch(() => "");
      throw new Error(
        `이미지 업로드 응답이 JSON이 아닙니다. WordPress 설정을 확인해주세요. ` +
        `WP_URL=${WP_URL}, 응답 미리보기: ${raw.slice(0, 200)}`
      );
    }

    const mediaResult = await uploadResponse.json();
    if (!mediaResult || !mediaResult.id || !mediaResult.source_url) {
      throw new Error(
        `이미지 업로드 응답이 올바르지 않습니다: ${JSON.stringify(mediaResult).substring(0, 200)}`
      );
    }
    
    console.log(
      `[CardNews] ✅ Image uploaded! ID: ${mediaResult.id}, URL: ${mediaResult.source_url}`
    );

    // 2. Find the News Terminal page ID by slug
    const terminalSlug = "daily-news-terminal";
    console.log(`[CardNews] Finding News Terminal page (slug: ${terminalSlug})...`);
    
    const pagesResponse = await fetchWithRetry(
      `${WP_URL}/wp-json/wp/v2/pages?slug=${terminalSlug}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      },
      2,
      "페이지 조회"
    );

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/122b107d-03ae-4b48-9b30-1372e8e984b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'lib/publisher.js:724',message:'WP pages fetch response',data:{status:pagesResponse?.status,contentType:pagesResponse?.headers?.get?.('content-type')||null,slug:terminalSlug,url:`${WP_URL}/wp-json/wp/v2/pages?slug=${terminalSlug}`},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const pagesContentType = pagesResponse.headers.get("content-type") || "";
    if (!pagesResponse.ok) {
      const errorPayload = pagesContentType.includes("application/json")
        ? await pagesResponse.json().catch(() => ({}))
        : await pagesResponse.text().catch(() => "");
      throw new Error(
        `News Terminal 페이지 조회 실패 (${pagesResponse.status}): ${
          errorPayload?.message || errorPayload || pagesResponse.status
        }`
      );
    }
    
    if (!pagesContentType.includes("application/json")) {
      const raw = await pagesResponse.text().catch(() => "");
      throw new Error(
        `페이지 조회 응답이 JSON이 아닙니다. 응답 미리보기: ${raw.slice(0, 200)}`
      );
    }

    const pages = await pagesResponse.json();
    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      throw new Error(
        `News Terminal 페이지를 찾을 수 없습니다 (slug: ${terminalSlug}). ` +
        `WordPress에서 해당 slug의 페이지가 존재하는지 확인해주세요.`
      );
    }

    const terminalPageId = pages[0].id;
    if (!terminalPageId) {
      throw new Error(
        `News Terminal 페이지 ID를 찾을 수 없습니다. 응답: ${JSON.stringify(pages[0]).substring(0, 200)}`
      );
    }
    
    console.log(`[CardNews] ✅ Found News Terminal page ID: ${terminalPageId}`);

    // 3. Update the News Terminal page's Featured Image and SEO OG Image
    console.log(`[CardNews] Updating page featured image via custom endpoint...`);
    console.log(`[CardNews] Page ID: ${terminalPageId}, Media ID: ${mediaResult.id}`);
    
    // Elementor로 편집된 페이지는 표준 REST API 업데이트 시 500 에러(렌더링 오류)가 발생할 수 있음
    // 해결: 전용 커스텀 엔드포인트(/xinchao/v1/set-featured-image)를 사용하여 메타데이터만 직접 업데이트
    // 이 방식은 Elementor의 무거운 저장 프로세스를 우회하여 안전합니다.
    const customUpdateData = {
      post_id: terminalPageId,
      media_id: mediaResult.id,
    };
    
    const updateResponse = await fetchWithRetry(
      `${WP_URL}/wp-json/xinchao/v1/set-featured-image`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(customUpdateData),
      },
      2,
      "Featured Image 업데이트 (커스텀)"
    );

    const updateContentType = updateResponse.headers.get("content-type") || "";
    const statusCode = updateResponse.status;
    const statusText = updateResponse.statusText;
    
    console.log(`[CardNews] Update response status: ${statusCode} ${statusText}`);
    console.log(`[CardNews] Update response content-type: ${updateContentType}`);
    
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/122b107d-03ae-4b48-9b30-1372e8e984b7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'lib/publisher.js:803',message:'WP page update response',data:{status:statusCode,contentType:updateContentType,pageId:terminalPageId},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

    let updatedPage = {};
    
    if (!updateResponse.ok) {
      // 응답 본문을 먼저 텍스트로 읽기
      const responseText = await updateResponse.text();
      
      // 전체 응답을 로그에 출력 (에러 원인 파악용)
      console.error(`[CardNews] ❌ Featured Image update failed:`);
      console.error(`[CardNews] Status: ${statusCode} ${statusText}`);
      console.error(`[CardNews] Full response body:`, responseText);
      
      let errorData;
      try {
        // JSON 파싱 시도
        errorData = JSON.parse(responseText);
      } catch (parseError) {
        // JSON이 아니면 HTML일 가능성이 높음 (WordPress 에러 페이지)
        // HTML에서 에러 메시지 추출 시도
        const errorMatch = responseText.match(/<h1[^>]*>(.*?)<\/h1>/i) || 
                          responseText.match(/<p[^>]*class="error"[^>]*>(.*?)<\/p>/i) ||
                          responseText.match(/<div[^>]*class="error"[^>]*>(.*?)<\/div>/i) ||
                          responseText.match(/Fatal error:.*?<\/p>/i) ||
                          responseText.match(/Warning:.*?<\/p>/i) ||
                          responseText.match(/Parse error:.*?<\/p>/i);
        
        const errorMessage = errorMatch ? errorMatch[1].replace(/<[^>]*>/g, '').trim() : 'Unknown error';
        
        errorData = {
          parseError: parseError.message,
          status: statusCode,
          statusText: statusText,
          htmlResponse: responseText,
          extractedError: errorMessage
        };
      }
      
      // Elementor 관련 에러인지 확인
      if (responseText.includes('elementor') || responseText.includes('Elementor')) {
        console.error(`[CardNews] 🔍 Elementor 관련 에러 감지!`);
        console.error(`[CardNews] 이 페이지는 Elementor로 편집되어 있어 REST API 업데이트가 제한될 수 있습니다.`);
      }
      
      // 실제 에러 메시지 출력
      console.error(`[CardNews] Extracted error message:`, errorData.extractedError || errorData.message || 'No error message found');
      
      // 에러를 throw하여 근본 원인 해결을 강제
      throw new Error(`Featured Image 업데이트 실패 (${statusCode}): ${errorData.extractedError || errorData.message || 'WordPress 서버 오류'}. 전체 응답: ${responseText.substring(0, 500)}`);
    } else {
      try {
        const resultData = updateContentType.includes("application/json")
          ? await updateResponse.json()
          : {};
        console.log(`[CardNews] ✅ Featured Image updated successfully via custom endpoint!`);
        console.log(`[CardNews] Result:`, resultData);
        updatedPage = {
          id: resultData.post_id || terminalPageId,
          featured_media: resultData.media_id || mediaResult.id
        };
      } catch (parseError) {
        console.warn(`[CardNews] ⚠️ Failed to parse response, but status was OK:`, parseError.message);
        updatedPage = { id: terminalPageId, featured_media: mediaResult.id };
      }
    }
    
    // 메타 필드 업데이트 (커스텀 엔드포인트에서 이미 처리함)
    console.log(`[CardNews] ✅ News Terminal update process completed.`);
    
    const terminalUrl = options.terminalUrl || `${WP_URL}/daily-news-terminal/`;
    console.log(`[CardNews] ✅ 카드뉴스 이미지 업로드 완료!`);
    console.log(`[CardNews] Terminal URL: ${terminalUrl}`);
    console.log(`[CardNews] Image URL for sharing: ${mediaResult.source_url}`);

    return {
      terminalUrl,
      imageUrl: mediaResult.source_url,
    };
  } catch (error) {
    console.error("[CardNews] Failed to update News Terminal:", error);
    // 에러 메시지를 더 명확하게
    if (error.message) {
      throw error; // 이미 명확한 메시지가 있으면 그대로 사용
    } else {
      throw new Error(
        `WordPress 게시 실패: ${error.message || "알 수 없는 오류"}. ` +
        `WordPress URL: ${WP_URL}, 환경 변수 확인: WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD`
      );
    }
  }
}

/**
 * WordPress 포스트를 휴지통으로 이동합니다 (완전 삭제는 WordPress에서 휴지통 비우기로)
 * @param {string} wordpressUrl - WordPress 포스트 URL
 * @returns {Promise<boolean>} - 삭제 성공 여부
 */
export async function deleteWordPressPost(wordpressUrl) {
  if (!wordpressUrl) {
    console.warn('[Delete] WordPress URL이 없습니다.');
    return false;
  }

  try {
    const auth = getWPAuth();
    console.log(`[Delete] 삭제 시도: ${wordpressUrl}`);
    
    // URL 정규화 (trailing slash 제거)
    const normalizedUrl = wordpressUrl.replace(/\/$/, '');
    const urlObj = new URL(normalizedUrl);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    
    console.log(`[Delete] URL 경로 파싱: ${JSON.stringify(pathParts)}`);
    
    // 방법 1: URL에서 직접 post ID 추출 시도 (예: /?p=123 형식)
    const urlParams = new URLSearchParams(urlObj.search);
    const postIdFromQuery = urlParams.get('p');
    
    let postId = null;
    
    if (postIdFromQuery) {
      // URL 쿼리에서 직접 ID 추출
      postId = parseInt(postIdFromQuery);
      console.log(`[Delete] URL 쿼리에서 포스트 ID 추출: ${postId}`);
    } else {
      // 방법 2: slug로 포스트 찾기
      const slug = pathParts[pathParts.length - 1];
      
      if (!slug) {
        throw new Error(`URL에서 slug를 추출할 수 없습니다: ${wordpressUrl}`);
      }
      
      console.log(`[Delete] Slug 추출: ${slug}`);
      
      // 방법 2-1: slug가 숫자만 있는 경우, post ID로 직접 시도
      const slugAsNumber = parseInt(slug);
      if (!isNaN(slugAsNumber) && slugAsNumber.toString() === slug) {
        console.log(`[Delete] Slug가 숫자입니다. Post ID로 직접 시도: ${slugAsNumber}`);
        // Post ID로 직접 접근해서 존재하는지 확인
        const directCheckResponse = await fetch(
          `${WP_URL}/wp-json/wp/v2/posts/${slugAsNumber}`,
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          }
        );
        
        if (directCheckResponse.ok) {
          const post = await directCheckResponse.json();
          // link 필드로 URL 매칭 확인
          if (post.link === normalizedUrl || 
              post.link === wordpressUrl ||
              post.link.replace(/\/$/, '') === normalizedUrl ||
              post.link.includes(slug)) {
            postId = slugAsNumber;
            console.log(`[Delete] Post ID로 직접 찾음: ${postId}`);
          } else {
            console.log(`[Delete] Post ID는 존재하지만 URL이 일치하지 않음. link: ${post.link}`);
          }
        } else {
          console.log(`[Delete] Post ID ${slugAsNumber}로 직접 접근 실패: ${directCheckResponse.status}`);
        }
      }
      
      // 방법 2-2: slug로 포스트 찾기 (숫자가 아니거나 직접 접근 실패한 경우)
      if (!postId) {
        console.log(`[Delete] Slug로 포스트 검색 시도...`);
        const searchResponse = await fetch(
          `${WP_URL}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`,
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          }
        );

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text();
          console.error(`[Delete] 포스트 검색 실패 (${searchResponse.status}):`, errorText);
          throw new Error(`포스트 검색 실패: ${searchResponse.status} - ${errorText.substring(0, 200)}`);
        }

        const posts = await searchResponse.json();
        console.log(`[Delete] 검색 결과: ${posts.length}개 포스트 발견`);
        
        if (posts.length === 0) {
          // 방법 2-3: 전체 URL로 검색 시도
          console.log(`[Delete] Slug 검색 실패, 전체 URL로 재시도...`);
          const urlSearchResponse = await fetch(
            `${WP_URL}/wp-json/wp/v2/posts?search=${encodeURIComponent(normalizedUrl)}`,
            {
              headers: {
                Authorization: `Basic ${auth}`,
              },
            }
          );
          
          if (urlSearchResponse.ok) {
            const urlPosts = await urlSearchResponse.json();
            if (urlPosts.length > 0) {
              // link 필드와 비교
              const matchedPost = urlPosts.find(p => 
                p.link === normalizedUrl || 
                p.link === wordpressUrl ||
                p.link.replace(/\/$/, '') === normalizedUrl
              );
              if (matchedPost) {
                postId = matchedPost.id;
                console.log(`[Delete] URL 검색으로 포스트 ID 찾음: ${postId}`);
              }
            }
          }
          
          if (!postId) {
            console.warn(`[Delete] 포스트를 찾을 수 없습니다: ${wordpressUrl} (slug: ${slug})`);
            return false;
          }
        } else {
          // 여러 포스트가 있을 경우 link 필드로 정확히 매칭
          const matchedPost = posts.find(p => 
            p.link === normalizedUrl || 
            p.link === wordpressUrl ||
            p.link.replace(/\/$/, '') === normalizedUrl
          );
          
          if (matchedPost) {
            postId = matchedPost.id;
            console.log(`[Delete] 포스트 ID 찾음: ${postId} (slug: ${slug})`);
          } else {
            // 매칭 실패 시 첫 번째 포스트 사용 (경고)
            postId = posts[0].id;
            console.warn(`[Delete] 정확한 매칭 실패, 첫 번째 포스트 사용: ${postId}`);
          }
        }
      }
    }

    if (!postId) {
      throw new Error('포스트 ID를 찾을 수 없습니다.');
    }

    // 포스트 삭제 (휴지통으로 이동, force=false는 기본값)
    console.log(`[Delete] 포스트 삭제 시도 (ID: ${postId})...`);
    const deleteResponse = await fetch(
      `${WP_URL}/wp-json/wp/v2/posts/${postId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!deleteResponse.ok) {
      const errorData = await deleteResponse.json().catch(() => ({}));
      const errorText = await deleteResponse.text().catch(() => '');
      console.error(`[Delete] 삭제 실패 (${deleteResponse.status}):`, errorData, errorText);
      
      // 401 또는 403 에러인 경우 인증 문제
      if (deleteResponse.status === 401 || deleteResponse.status === 403) {
        throw new Error(`WordPress 인증 실패 (${deleteResponse.status}). WORDPRESS_USERNAME과 WORDPRESS_APP_PASSWORD를 확인해주세요.`);
      }
      
      throw new Error(errorData.message || errorText || `삭제 실패: ${deleteResponse.status}`);
    }

    const result = await deleteResponse.json().catch(() => ({}));
    console.log(`[Delete] ✅ WordPress 포스트 휴지통으로 이동 완료: ${wordpressUrl} (ID: ${postId})`);
    return true;
  } catch (error) {
    console.error(`[Delete] ❌ WordPress 포스트 삭제 실패: ${wordpressUrl}`, error);
    console.error(`[Delete] 에러 상세:`, error.message, error.stack);
    return false;
  }
}
