const https = require('https');

// ⚠️ 비밀번호를 코드에 적지 않는다 — .env 의 WORDPRESS_APP_PASSWORD 를 쓴다.
//    (2026-08-14 실제 앱 비밀번호가 여기 하드코딩돼 git 에 올라가 있던 것을 제거.
//     git 이력에는 남아 있으므로 해당 application password 는 회전 권고.)
const wpUrl = process.env.WORDPRESS_URL || 'https://chaovietnam.co.kr';
const wpUser = process.env.WORDPRESS_USERNAME || 'chaovietnam';
const wpPassword = process.env.WORDPRESS_APP_PASSWORD;

if (!wpUrl || !wpUser || !wpPassword) {
    console.error("Missing credentials");
    process.exit(1);
}

const auth = Buffer.from(`${wpUser}:${wpPassword}`).toString('base64');

const options = {
    hostname: wpUrl.replace('https://', '').replace('http://', ''),
    path: '/wp-json/wp/v2/categories?per_page=100',
    method: 'GET',
    headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            const categories = JSON.parse(data);
            console.log("Categories found:");
            categories.forEach(cat => {
                console.log(`ID: ${cat.id}, Name: ${cat.name}, Slug: ${cat.slug}, Parent: ${cat.parent}`);
            });
        } else {
            console.error(`Error: ${res.statusCode} ${res.statusMessage}`);
            console.error(data);
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
