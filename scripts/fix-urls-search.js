const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WP_URL = "https://chaovietnam.co.kr";
const WP_USER = process.env.WORDPRESS_USERNAME || 'chaovietnam';
const WP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

async function fixUrlsRobustly() {
    const auth = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString('base64');

    const news = await prisma.newsItem.findMany({
        where: {
            status: 'PUBLISHED',
            wordpressUrl: {
                contains: '/119'
            }
        },
        orderBy: { publishedAt: 'desc' },
    });

    console.log(`Checking ${news.length} articles with suspicious URLs...`);

    let fixCount = 0;

    for (const item of news) {
        if (!item.wordpressUrl) continue;

        // Check if it's a numeric URL
        const match = item.wordpressUrl.match(/\/(\d+)\/?$/);
        if (match) {
            console.log(`\n🔍 Investigating: ${item.title.substring(0, 40)}`);

            try {
                // Search by the exact title in WP REST API
                const encodedSearch = encodeURIComponent(item.translatedTitle || item.title);
                const searchUrl = `${WP_URL}/wp-json/wp/v2/posts?search=${encodedSearch}&per_page=1`;

                const response = await fetch(searchUrl, {
                    headers: { 'Authorization': `Basic ${auth}` }
                });

                if (response.ok) {
                    const posts = await response.json();
                    if (posts && posts.length > 0) {
                        const actualPost = posts[0];
                        const newUrl = `${WP_URL}/${actualPost.slug}/`;

                        if (newUrl !== item.wordpressUrl) {
                            await prisma.newsItem.update({
                                where: { id: item.id },
                                data: { wordpressUrl: newUrl }
                            });
                            console.log(`✅ Fixed! New URL: ${newUrl}`);
                            fixCount++;
                        } else {
                            console.log(`➖ URL was already correct: ${item.wordpressUrl}`);
                        }
                    } else {
                        console.log(`❌ Could not find post in WP by title search.`);
                    }
                } else {
                    console.log(`❌ Failed to search WP api: HTTP ${response.status}`);
                }
            } catch (err) {
                console.error(`Error processing: ${err.message}`);
            }
        }
    }

    console.log(`\n🎉 Finished! Fixed ${fixCount} URLs in the database.`);
}

fixUrlsRobustly()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
