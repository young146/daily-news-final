import { NextResponse } from "next/server";

const WP_URL = process.env.WORDPRESS_URL || "https://chaovietnam.co.kr";
const WP_USER = process.env.WORDPRESS_USERNAME || "chaovietnam";
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

function getWPAuth() {
  return Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");
}

function sanitizeForWordPress(str) {
  if (!str) return "";
  str = str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
  str = str.replace(/[\u200B-\u200D\uFEFF]/g, "");
  return str.trim();
}

async function uploadFileToWordPress(file, title) {
  try {
    const auth = getWPAuth();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const filename = file.name || `image_${Date.now()}.jpg`;
    const mimeType = file.type || "image/jpeg";
    
    const parts = [];
    const fileHeader = `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`;
    parts.push(Buffer.from(fileHeader, "utf8"));
    parts.push(buffer);
    parts.push(Buffer.from("\r\n", "utf8"));
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
      console.error("[Update Manual News] WordPress media upload failed:", errorText);
      return null;
    }
    
    const mediaData = await response.json();
    return {
      id: mediaData.id,
      url: mediaData.source_url,
    };
  } catch (error) {
    console.error("[Update Manual News] File upload error:", error);
    return null;
  }
}

export async function PUT(request) {
  try {
    const formData = await request.formData();
    
    const postId = formData.get("postId");
    const title = formData.get("title");
    const content = formData.get("content");
    const category = formData.get("category");
    const source = formData.get("source") || "자체 취재";
    const featuredImageIndex = parseInt(formData.get("featuredImageIndex") || "0");
    
    if (!postId || !title || !content || !category) {
      return NextResponse.json(
        { error: "필수 필드가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 기존 기사 정보 가져오기
    const auth = getWPAuth();
    const existingPostResponse = await fetch(`${WP_URL}/wp-json/wp/v2/posts/${postId}`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!existingPostResponse.ok) {
      return NextResponse.json(
        { error: "기사를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 새로 업로드된 이미지 파일들 처리
    const imageFiles = [];
    const imageIds = [];
    
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
    
    imageFiles.sort((a, b) => {
      const indexA = imageIds.indexOf(a.id);
      const indexB = imageIds.indexOf(b.id);
      return indexA - indexB;
    });

    // 새 이미지 업로드
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

    // 대표 사진 선택
    const featuredImage = uploadedImages[featuredImageIndex] || uploadedImages[0];
    
    // 본문에 이미지 삽입
    let finalContent = content;
    uploadedImages.forEach((img) => {
      const placeholder = `[IMAGE_${img.id}]`;
      if (finalContent.includes(placeholder)) {
        const imageHtml = `<img src="${img.url}" alt="${title}" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
        finalContent = finalContent.replace(placeholder, imageHtml);
      }
    });

    const sourceAttribution = `
    <div class="news-source-header">
        <div class="news-source-info"><strong>📰 출처:</strong> ${source}</div>
        <div class="news-source-info"><strong>📅 날짜:</strong> ${new Date().toLocaleDateString('ko-KR')}</div>
    </div>`;

    let wpContent = sourceAttribution;
    if (featuredImage) {
      const featuredImageHtml = `<img src="${featuredImage.url}" alt="${title}" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
      wpContent += featuredImageHtml;
    }
    
    wpContent += finalContent;

    // WordPress 기사 업데이트
    const categoryIds = [6, 31];

    const postData = {
      title: sanitizeForWordPress(title),
      content: sanitizeForWordPress(wpContent),
      categories: categoryIds,
      meta: {
        news_category: category,
        news_source: source,
      },
    };

    if (featuredImage) {
      postData.featured_media = featuredImage.mediaId;
    }

    const wpResponse = await fetch(`${WP_URL}/wp-json/wp/v2/posts/${postId}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    });

    if (!wpResponse.ok) {
      const errorText = await wpResponse.text();
      console.error("[Update Manual News] WordPress update failed:", errorText);
      return NextResponse.json(
        { error: "WordPress 업데이트 실패", details: errorText },
        { status: 500 }
      );
    }

    const wpPost = await wpResponse.json();

    return NextResponse.json({
      success: true,
      postUrl: wpPost.link,
      postId: wpPost.id,
      message: "기사가 성공적으로 수정되었습니다.",
    });
  } catch (error) {
    console.error("[Update Manual News] Error:", error);
    return NextResponse.json(
      { error: "서버 오류", details: error.message },
      { status: 500 }
    );
  }
}

