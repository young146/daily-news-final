import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const WP_URL = process.env.WORDPRESS_URL || "https://chaovietnam.co.kr";
const WP_USER = process.env.WORDPRESS_USERNAME || "chaovietnam";
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

function getWPAuth() {
  return Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");
}

async function uploadFileToWordPress(file, title) {
  try {
    const auth = getWPAuth();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // multipart/form-data 형식으로 생성
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const filename = file.name || `image_${Date.now()}.jpg`;
    const mimeType = file.type || "image/jpeg";
    
    // multipart/form-data 본문 구성
    const parts = [];
    
    // 파일 필드
    const fileHeader = `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`;
    parts.push(Buffer.from(fileHeader, "utf8"));
    parts.push(buffer);
    parts.push(Buffer.from("\r\n", "utf8"));
    
    // 종료 경계
    const footer = `--${boundary}--\r\n`;
    parts.push(Buffer.from(footer, "utf8"));
    
    const formDataBuffer = Buffer.concat(parts);
    
    const response = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": formDataBuffer.length.toString(),
      },
      body: formDataBuffer,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Manual News] WordPress media upload failed:", errorText);
      return null;
    }
    
    const mediaData = await response.json();
    return {
      id: mediaData.id,
      url: mediaData.source_url,
    };
  } catch (error) {
    console.error("[Manual News] File upload error:", error);
    return null;
  }
}

function sanitizeForWordPress(str) {
  if (!str) return "";
  str = str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, "");
  return str.trim();
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    
    const title = formData.get("title");
    const content = formData.get("content");
    const category = formData.get("category");
    const source = formData.get("source") || "자체 취재";
    const featuredImageIndex = parseInt(formData.get("featuredImageIndex") || "0");
    
    if (!title || !content || !category) {
      return NextResponse.json(
        { error: "제목, 본문, 카테고리는 필수입니다." },
        { status: 400 }
      );
    }

    // 이미지 파일들 처리 (image_로 시작하는 모든 키 찾기)
    const imageFiles = [];
    const imageIds = [];
    
    // FormData의 모든 키를 순회하면서 이미지 파일 찾기
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("image_") && value instanceof File && value.size > 0) {
        const imageId = key.replace("image_", "");
        imageIds.push(imageId);
        imageFiles.push({
          file: value,
          id: imageId,
        });
      }
    }
    
    // 이미지 ID로 정렬 (원래 순서 유지)
    imageFiles.sort((a, b) => {
      const indexA = imageIds.indexOf(a.id);
      const indexB = imageIds.indexOf(b.id);
      return indexA - indexB;
    });

    // 이미지 업로드 (WordPress Media Library에 직접 업로드)
    const uploadedImages = [];
    
    for (let i = 0; i < imageFiles.length; i++) {
      const img = imageFiles[i];
      const uploadResult = await uploadFileToWordPress(
        img.file,
        `${title}_${i}`
      );
      
      if (uploadResult) {
        uploadedImages.push({
          id: img.id,
          index: i,
          url: uploadResult.url,
          mediaId: uploadResult.id,
        });
      }
    }

    // 대표 사진 선택 (featuredImageIndex는 업로드된 이미지의 인덱스)
    const featuredImage = uploadedImages[featuredImageIndex] || uploadedImages[0];
    
    // 본문에 이미지 삽입 위치 확인
    // content에 [IMAGE_1234567890] 등의 플레이스홀더가 있을 수 있음 (id 사용)
    let finalContent = content;
    
    // 플레이스홀더를 실제 이미지 HTML로 교체
    uploadedImages.forEach((img) => {
      const placeholder = `[IMAGE_${img.id}]`;
      if (finalContent.includes(placeholder)) {
        const imageHtml = `<img src="${img.url}" alt="${title}" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
        finalContent = finalContent.replace(placeholder, imageHtml);
      }
    });

    // WP 31 형식으로 본문 구성
    const bodyStyle = `
<style>
.news-body-content {
    font-size: 17px !important;
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

    // 출처 정보 추가
    const sourceAttribution = `
    <div class="news-source-header">
        <div class="news-source-info"><strong>📰 출처:</strong> ${source}</div>
        <div class="news-source-info"><strong>📅 날짜:</strong> ${new Date().toLocaleDateString('ko-KR')}</div>
    </div>`;

    // 대표 사진을 맨 앞에 추가
    let wpContent = sourceAttribution + bodyStyle;
    if (featuredImage) {
      const featuredImageHtml = `<img src="${featuredImage.url}" alt="${title}" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
      wpContent += featuredImageHtml;
    }
    
    // 본문 추가 (이미지 플레이스홀더는 이미 교체됨)
    wpContent += finalContent + "</div>";

    // WordPress에 발행
    const auth = getWPAuth();
    const categoryIds = [6, 31]; // 뉴스 > 데일리뉴스

    const postData = {
      title: sanitizeForWordPress(title),
      content: sanitizeForWordPress(wpContent),
      status: "publish",
      categories: categoryIds,
      meta: {
        news_category: category,
        news_source: source,
        is_top_news: "0",
      },
    };

    // 대표 사진 설정
    if (featuredImage) {
      postData.featured_media = featuredImage.mediaId;
    }

    const wpResponse = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    });

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      console.error("[Manual News] WordPress publish failed:", errorText);
      return NextResponse.json(
        { error: "WordPress 발행 실패", details: errorText },
        { status: 500 }
      );
    }

    const wpPost = await wpResponse.json();
    
    // 새로운 뉴스가 발행되면 이전 카드 뉴스 초기화
    await prisma.newsItem.updateMany({
      where: { isCardNews: true },
      data: { isCardNews: false },
    });
    console.log(`[Manual News] ✅ Cleared isCardNews flags - new news published`);
    
    // 데이터베이스에 저장 (선택사항)
    await prisma.newsItem.create({
      data: {
        title: title,
        content: finalContent,
        category: category,
        source: source,
        translatedTitle: title,
        translatedContent: wpContent,
        isPublishedMain: true,
        wordpressUrl: wpPost.link,
        wordpressImageUrl: featuredImage?.url || null,
        wordpressMediaId: featuredImage?.mediaId || null,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      postUrl: wpPost.link,
      postId: wpPost.id,
    });
  } catch (error) {
    console.error("[Manual News] Error:", error);
    return NextResponse.json(
      { error: "서버 오류", details: error.message },
      { status: 500 }
    );
  }
}

