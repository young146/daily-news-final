const crawlCafef = require('./scripts/crawlers/cafef');

(async () => {
    try {
        console.log('Testing Cafef crawler...\n');
        const items = await crawlCafef();
        console.log('\n=== Results ===');
        console.log(`Total items: ${items.length}`);
        if (items.length > 0) {
            console.log('\nFirst 5 items:');
            items.slice(0, 5).forEach((item, i) => {
                console.log(`\n${i+1}. ${item.title.substring(0, 70)}`);
                console.log(`   URL: ${item.originalUrl}`);
                console.log(`   Summary: ${item.summary ? item.summary.substring(0, 50) : 'N/A'}`);
            });
        } else {
            console.log('No items collected!');
        }
    } catch(e) {
        console.error('Error:', e.message);
        console.error(e.stack);
    }
})();

