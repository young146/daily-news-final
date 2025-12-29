const crawlVnExpressEconomy = require('./scripts/crawlers/vnexpress-economy');

(async () => {
    try {
        console.log('Testing VnExpress Economy image extraction...\n');
        const items = await crawlVnExpressEconomy();
        console.log(`\nTotal items: ${items.length}\n`);
        
        console.log('=== Image URLs ===\n');
        items.slice(0, 5).forEach((item, i) => {
            console.log(`${i+1}. ${item.title.substring(0, 60)}`);
            console.log(`   Image: ${item.imageUrl || 'NO IMAGE'}`);
            console.log(`   Content length: ${item.content ? item.content.length : 0} chars`);
            console.log('');
        });
        
        const itemsWithImage = items.filter(item => item.imageUrl && item.imageUrl.length > 0);
        console.log(`\nItems with images: ${itemsWithImage.length}/${items.length}`);
        
    } catch(e) {
        console.error('Error:', e.message);
    }
})();

