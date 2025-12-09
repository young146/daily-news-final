
// web/scripts/scheduler.js
const { exec } = require('child_process');
const cron = require('node-cron'); // User might need to install this: npm install node-cron

console.log('⏳ Scheduler started. Waiting for 7:00 AM (Vietnam time)...');

// Schedule task to run at 7:00 AM every day (Vietnam timezone UTC+7)
// 7:00 AM Vietnam = 0:00 UTC
cron.schedule('0 0 * * *', () => {
    console.log('⏰ It is 7:00 AM Vietnam time. Starting crawler...');

    exec('npm run crawl', (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Crawler failed: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`⚠️ Crawler stderr: ${stderr}`);
        }
        console.log(`✅ Crawler output:\n${stdout}`);
    });
});
