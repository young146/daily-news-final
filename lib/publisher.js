const WP_URL = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
const WP_USER = process.env.WORDPRESS_USERNAME || 'chaovietnam';
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

/**
 * Uploads an image to WordPress using the custom XinChao endpoint.
 * This endpoint downloads the image on WordPress server side, bypassing hotlink protection.
 * @param {string} imageUrl - The source image URL
 * @param {string} title - Title for the image
 * @returns {Promise<{id: number, url: string}|null>} - WordPress media info or null if failed
 */
async function uploadImageToWordPress(imageUrl, title) {
    if (!imageUrl || !WP_PASSWORD) return null;
    
    console.log(`[Image] Requesting WordPress to download: ${imageUrl.substring(0, 60)}...`);
    
    try {
        const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');
        
        // Use custom XinChao endpoint that downloads image server-side
        const response = await fetch(`${WP_URL}/wp-json/xinchao/v1/upload-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image_url: imageUrl,
                title: title
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log(`[Image] Upload failed:`, errorData.message || response.status);
            return null;
        }
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`[Image] ✅ Upload success! ID: ${result.attachment_id}`);
            console.log(`[Image] URL: ${result.url}`);
            return {
                id: result.attachment_id,
                url: result.url
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
 * Publishes content to the main site (chaovietnam.co.kr > 뉴스 > 데일리뉴스).
 * @param {object} item - News item to publish
 * @returns {Promise<{postUrl: string, imageUrl: string|null, mediaId: number|null}>} - The URL of the published post, uploaded image URL, and media ID
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
        let uploadedImageUrl = null;
        
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
                uploadedImageUrl = uploadResult.url;
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
        
        // Return post URL, uploaded image URL, and media ID
        return {
            postUrl: newPost.link,
            imageUrl: uploadedImageUrl,
            mediaId: featuredMediaId
        };

    } catch (error) {
        console.error('[Publish] Failed to publish to Main Site:', error);
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
        let featuredMediaId = item.wordpressMediaId || null;
        
        // Check if we already have an uploaded image URL from the main article
        if (item.wordpressImageUrl) {
            // Reuse the already uploaded image - no need to upload again!
            console.log(`[Publish] Reusing already uploaded image: ${item.wordpressImageUrl}`);
            const imageHtml = `<img src="${item.wordpressImageUrl}" alt="${item.translatedTitle || item.title}" style="width:100%; height:auto; margin-bottom: 20px; display:block;" /><br/>`;
            summaryContent = imageHtml + `<p>${summaryContent}</p>`;
        } else if (item.imageUrl) {
            // Fallback: Upload image if no WordPress URL exists
            console.log(`[Publish] No cached image, uploading fresh...`);
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
            meta: {}
        };
        
        // Set featured image using reused media ID (for Jenny Daily News plugin)
        if (featuredMediaId) {
            postData.featured_media = featuredMediaId;
            console.log(`[Publish] Setting featured image with media ID: ${featuredMediaId}`);
        }
        
        // Store full article URL as custom field (for Jenny plugin direct link)
        if (item.wordpressUrl) {
            postData.meta.full_article_url = item.wordpressUrl;
            console.log(`[Publish] Setting full article URL: ${item.wordpressUrl}`);
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
