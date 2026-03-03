const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WP_URL = "https://chaovietnam.co.kr";
const WP_USER = "chaovietnam";
// We don't necessarily need password if we just read public data, but we can access DB directly
// Wait, we can construct the API url based on ID to get the slug
// 119665 -> /wp-json/wp/v2/posts/119665 -> gets the slug

async function fixUrls() {
    const news = await prisma.newsItem.findMany({
        where: {
            status: 'PUBLISHED',
            wordpressUrl: {
                contains: '/119' // Recently published posts all start with 119xxx
            }
        },
        orderBy: { publishedAt: 'desc' },
        take: 50
    });

    console.log(`Found ${news.length} articles to check...`);

    let fixCount = 0;

    for (const item of news) {
        if (!item.wordpressUrl) continue;

        // Check if it's a numeric URL, like https://chaovietnam.co.kr/119665/
        const match = item.wordpressUrl.match(/\/(\d+)\/?$/);
        if (match) {
            const postId = match[1];
            console.log(`Checking post ID ${postId} for: ${item.title.substring(0, 30)}`);

            try {
                const response = await fetch(`${WP_URL}/wp-json/wp/v2/posts/${postId}`);
                if (response.ok) {
                    const wpData = await response.json();
                    if (wpData.slug) {
                        const newUrl = `${WP_URL}/${wpData.slug}/`;
                        await prisma.newsItem.update({
                            where: { id: item.id },
                            data: { wordpressUrl: newUrl }
                        });
                        console.log(`✅ Fixed: ${newUrl}`);
                        fixCount++;
                    }
                } else {
                    console.log(`❌ Failed to fetch WP data for ${postId}`);
                }
            } catch (err) {
                console.error(`Error processing ${postId}: ${err.message}`);
            }
        }
    }

    console.log(`Finished fixing ${fixCount} URLs in the database.`);
}

fixUrls()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
