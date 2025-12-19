const https = require("https");
const crypto = require("crypto");

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
 * @param {string} imageUrl - The source image URL
 * @param {string} title - Title for the image
 * @returns {Promise<{id: number, url: string}|null>} - WordPress media info or null if failed
 */
export async function uploadImageToWordPress(imageUrl, title) {
  if (!imageUrl || !WP_PASSWORD) return null;

  // Check if this is a SSL problem host (like Yonhap)
  if (isSSLProblemHost(imageUrl)) {
    console.log(
      `[Image] SSL problem host detected, downloading via Replit first...`
    );
    const imageBuffer = await downloadImageViaReplit(imageUrl);
    if (imageBuffer) {
      return await uploadImageDirectly(imageBuffer, title);
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
      return {
        id: result.attachment_id,
        url: result.url,
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
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    border-left: 4px solid #3b82f6;
    margin-bottom: 30px;
    font-size: 15px; /* 1px 증가 (14px -> 15px) */
    color: #374151;
    line-height: 1.8; /* 다크모드 가독성 향상 */
}
/* 다크모드 지원 */
@media (prefers-color-scheme: dark) {
    .news-source-header {
        background: #1f2937;
        color: #e5e7eb !important;
        border-left-color: #60a5fa;
    }
}
.news-source-info {
    display: block;
    margin-bottom: 10px;
    font-size: 15px;
}
.news-source-link-btn {
    display: inline-block;
    padding: 8px 16px;
    background-color: #3b82f6;
    color: #ffffff !important;
    text-decoration: none !important;
    border-radius: 20px;
    font-weight: 600;
    font-size: 14px; /* 1px 증가 (13px -> 14px) */
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
}
.news-source-link-btn:hover {
    background-color: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
    color: #ffffff !important;
}
</style>
<div class="news-source-header">
    <div class="news-source-info"><strong>📰 출처:</strong> ${sourceName}</div>
    <div class="news-source-info"><strong>📅 날짜:</strong> ${dateStr}</div>
    ${
      item.originalUrl
        ? `<div style="margin-top: 8px;"><a href="${item.originalUrl}" target="_blank" rel="noopener noreferrer" class="news-source-link-btn">🌐 원문 기사 전체 보기</a></div>`
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
    const auth = getWPAuth();
    const categoryIds = await getCategoryId(item.category);

    let finalContent =
      item.translatedContent || item.content || item.summary || "";
    let featuredMediaId = null;
    let uploadedImageUrl = null;

    // Add source attribution at the top (before image)
    const sourceAttribution = generateSourceAttribution(item);

    // Add body text styling for better readability in dark mode
    const bodyStyle = `
<style>
.news-body-content {
    font-size: 17px !important; /* 기본 15px에서 2px 증가 */
    line-height: 1.8 !important;
    color: #1f2937 !important;
}
@media (prefers-color-scheme: dark) {
    .news-body-content {
        color: #e5e7eb !important;
        font-size: 17px !important;
    }
}
.news-body-content p {
    font-size: 17px !important;
    line-height: 1.8 !important;
    margin-bottom: 16px !important;
}
.news-body-content h1, .news-body-content h2, .news-body-content h3 {
    color: inherit !important;
}
</style>
<div class="news-body-content">`;

    finalContent = sourceAttribution + bodyStyle + finalContent + "</div>";

    // Upload image to WordPress if available
    if (item.imageUrl) {
      const uploadResult = await uploadImageToWordPress(
        item.imageUrl,
        item.translatedTitle || item.title
      );

      if (uploadResult) {
        // Add image to content
        const imageHtml = `<img src="${uploadResult.url}" alt="${
          item.translatedTitle || item.title
        }" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
        finalContent = imageHtml + finalContent;
        featuredMediaId = uploadResult.id;
        uploadedImageUrl = uploadResult.url;
      }
    }

    const postData = {
      title: sanitizeForWordPress(item.translatedTitle || item.title),
      content: sanitizeForWordPress(finalContent),
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

    // Return post URL, uploaded image URL, and media ID
    return {
      postUrl: newPost.link,
      imageUrl: uploadedImageUrl,
      mediaId: featuredMediaId,
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
        item.translatedTitle || item.title
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
    console.log(`[CardNews] Updating page featured image...`);
    
    const updateResponse = await fetchWithRetry(
      `${WP_URL}/wp-json/wp/v2/pages/${terminalPageId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          featured_media: mediaResult.id,
          meta: {
            // Yoast SEO OG image fields
            "_yoast_wpseo_opengraph-image": mediaResult.source_url,
            "_yoast_wpseo_opengraph-image-id": mediaResult.id.toString(),
            // Rank Math OG image fields
            rank_math_facebook_image: mediaResult.source_url,
            rank_math_facebook_image_id: mediaResult.id.toString(),
            rank_math_twitter_use_facebook: "on",
          },
        }),
      },
      2,
      "페이지 업데이트"
    );

    const updateContentType = updateResponse.headers.get("content-type") || "";
    let updatedPage = {};
    
    if (!updateResponse.ok) {
      const errorData = updateContentType.includes("application/json")
        ? await updateResponse.json().catch(() => ({}))
        : await updateResponse.text().catch(() => "");
      console.error(`[CardNews] Page update failed:`, errorData);
      // 메타 업데이트 실패는 경고만 하고 계속 진행 (Featured Image는 업데이트됨)
      console.warn(`[CardNews] ⚠️ 메타 필드 업데이트 실패했지만 Featured Image는 업데이트되었을 수 있습니다.`);
    } else {
      updatedPage = updateContentType.includes("application/json")
        ? await updateResponse.json().catch(() => ({}))
        : {};
    }
    
    const terminalUrl = updatedPage.link || options.terminalUrl || `${WP_URL}/daily-news-terminal/`;
    console.log(`[CardNews] ✅ News Terminal Featured Image updated!`);
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
