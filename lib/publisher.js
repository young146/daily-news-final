const WP_URL = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
const WP_USER = process.env.WORDPRESS_USERNAME || 'chaovietnam';
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

/**
 * Downloads an image from URL and uploads it to WordPress Media Library
 * @param {string} imageUrl - The source image URL
 * @param {string} title - Title for the image (used as alt text and filename)
 * @returns {Promise<string|null>} - The WordPress media URL or null if failed
 */
async function uploadImageToWordPress(imageUrl, title) {
    if (!imageUrl || !WP_PASSWORD) return null;
    
    console.log(`[Image] Downloading: ${imageUrl.substring(0, 60)}...`);
    
    try {
        // Download the image
        const imageResponse = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': imageUrl
            }
        });
        
        if (!imageResponse.ok) {
            console.log(`[Image] Failed to download: ${imageResponse.status}`);
            return null;
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        
        // Determine file extension
        let ext = 'jpg';
        if (contentType.includes('png')) ext = 'png';
        else if (contentType.includes('gif')) ext = 'gif';
        else if (contentType.includes('webp')) ext = 'webp';
        
        // Create filename from title (sanitized)
        const sanitizedTitle = title
            .replace(/[^a-zA-Z0-9가-힣]/g, '_')
            .substring(0, 50);
        const filename = `${sanitizedTitle}_${Date.now()}.${ext}`;
        
        console.log(`[Image] Uploading to WordPress: ${filename}`);
        
        // Upload to WordPress
        const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
        
        const uploadResponse = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`
            },
            body: Buffer.from(imageBuffer)
        });
        
        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            console.log(`[Image] Upload failed:`, errorData.message || errorData);
            return null;
        }
        
        const mediaData = await uploadResponse.json();
        console.log(`[Image] Upload success! ID: ${mediaData.id}, URL: ${mediaData.source_url}`);
        
        return {
            id: mediaData.id,
            url: mediaData.source_url
        };
        
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
 * Publishes content to the main site (chaovietnam.co.kr).
 * @param {object} item - News item to publish
 * @returns {Promise<string>} - The URL of the published post
 */
export async function publishToMainSite(item) {
    console.log(`[Publish] Publishing to Main Site: ${item.title}`);

    if (!WP_PASSWORD) {
        throw new Error('WordPress App Password is not configured');
    }

    try {
        const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
        const categoryIds = await getCategoryId(item.category);

        let finalContent = item.translatedContent || item.content || item.summary;
        let featuredMediaId = null;
        
        // Upload image to WordPress if available
        if (item.imageUrl) {
            const uploadResult = await uploadImageToWordPress(
                item.imageUrl, 
                item.translatedTitle || item.title
            );
            
            if (uploadResult) {
                // Add image to content
                const imageHtml = `<img src="${uploadResult.url}" alt="${item.translatedTitle || item.title}" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
                finalContent = imageHtml + finalContent;
                featuredMediaId = uploadResult.id;
            }
        }

        const postData = {
            title: item.translatedTitle || item.title,
            content: finalContent,
            status: 'publish',
            categories: categoryIds,
        };
        
        // Set featured image if uploaded
        if (featuredMediaId) {
            postData.featured_media = featuredMediaId;
        }

        const response = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`WordPress API Error: ${JSON.stringify(errorData)}`);
        }

        const newPost = await response.json();
        console.log(`[Publish] Success! Link: ${newPost.link}`);
        return newPost.link;

    } catch (error) {
        console.error('[Publish] Failed to publish to Main Site:', error);
        throw error;
    }
}

/**
 * Publishes SUMMARY content to WordPress (뉴스 > 데일리뉴스 요약본).
 * Category IDs: 6 (뉴스), 711 (데일리뉴스 요약본)
 * @param {object} item - News item to publish
 * @returns {Promise<string>} - The URL of the published summary post
 */
export async function publishToDailySite(item) {
    console.log(`[Publish] Publishing Summary to Daily News Summary: ${item.title}`);

    if (!WP_PASSWORD) {
        throw new Error('WordPress App Password is not configured');
    }

    try {
        const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
        
        // Category IDs for "뉴스 > 데일리뉴스 요약본"
        const categoryIds = [6, 711];

        // Use SUMMARY content (not full content)
        let summaryContent = item.translatedSummary || item.summary || '';
        let featuredMediaId = null;
        
        // Upload image to WordPress if available
        if (item.imageUrl) {
            const uploadResult = await uploadImageToWordPress(
                item.imageUrl, 
                item.translatedTitle || item.title
            );
            
            if (uploadResult) {
                const imageHtml = `<img src="${uploadResult.url}" alt="${item.translatedTitle || item.title}" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
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
            status: 'publish',
            categories: categoryIds,
        };
        
        // Set featured image if uploaded
        if (featuredMediaId) {
            postData.featured_media = featuredMediaId;
        }

        const response = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`WordPress API Error: ${JSON.stringify(errorData)}`);
        }

        const newPost = await response.json();
        console.log(`[Publish] Summary published! Link: ${newPost.link}`);
        return newPost.link;

    } catch (error) {
        console.error('[Publish] Failed to publish summary:', error);
        throw error;
    }
}
