const axios = require('axios');
const cheerio = require('cheerio');

// 교민들의 관심사를 저격하는 맞춤형 키워드 그룹
const TOPICS = [
    {
        category: 'Culture', // 맛집/카페는 문화로 분류
        keywords: [
            '"Vietnam" "Michelin Guide"',
            '"Ho Chi Minh" "new cafe"',
            '"Hanoi" "new cafe"',
            '"Vietnam" "best restaurant"',
            '"Vietnam" "street food"',
            'Saigon craft beer'
        ]
    },
    {
        category: 'Culture', // 여행도 문화/레저
        keywords: [
            '"Vietnam" "new resort"',
            '"Vietnam" "hotel opening"',
            '"Vietnam" "weekend getaway"',
            '"Vietnam" "golf course"',
            '"Da Nang" "travel"',
            '"Phu Quoc" "travel"'
        ]
    },
    {
        category: 'Society', // 펫은 생활/사회 밀착형
        keywords: [
            '"Vietnam" "pet friendly"',
            '"Vietnam" "veterinary"',
            '"Vietnam" "dog park"',
            '"Vietnam" "animal shelter"',
            'travel with pets Vietnam'
        ]
    }
];

async function crawlGoogleDiscovery() {
    console.log('🚀 구글 뉴스 정찰대 출발 (맛집/여행/펫)...');
    const allItems = [];

    // 중복 제거용
    const seenUrls = new Set();

    for (const topic of TOPICS) {
        // 키워드들을 OR로 묶어서 한 번에 검색 (효율성)
        // 예: (Vietnam Michelin OR Hanoi new cafe OR ...)
        const query = topic.keywords.join(' OR ');
        const encodedQuery = encodeURIComponent(query);
        // 정확도순 정렬, 최근 24시간 이내 (when:1d)
        const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}+when:1d&hl=en-VN&gl=VN&ceid=VN:en`;

        try {
            const { data } = await axios.get(rssUrl);
            const $ = cheerio.load(data, { xmlMode: true });

            $('item').each((i, el) => {
                if (i > 3) return; // 토픽당 상위 3개만 엄선 (너무 많으면 피로함)

                const link = $(el).find('link').text();
                const title = $(el).find('title').text();
                const pubDate = new Date($(el).find('pubDate').text());

                // 구글 뉴스 description은 HTML을 포함하므로 텍스트만 추출 시도
                const descHtml = $(el).find('description').text();
                const $desc = cheerio.load(descHtml);
                const summary = $desc.text().substring(0, 200) + '...';

                // 이미 수집한 링크면 패스
                if (seenUrls.has(link)) return;
                seenUrls.add(link);

                allItems.push({
                    title: `[발견] ${title}`, // [발견] 태그로 구분
                    summary: summary,
                    originalUrl: link, // 구글 리다이렉트 링크 (상세 페이지에서 풀림)
                    imageUrl: null, // 구글 RSS는 이미지가 없음 (상세 크롤링이나 기본 이미지 사용)
                    category: topic.category,
                    source: 'Google Discovery',
                    publishedAt: pubDate,
                    status: 'DRAFT',
                    content: `이 뉴스는 구글 뉴스 키워드 탐색기에서 발견했습니다.<br>키워드: ${query}<br><br>원문 요약: ${summary}` // 초기 콘텐츠
                });
            });

        } catch (error) {
            console.error(`❌ 구글 검색 실패 (${topic.keywords[0]}...):`, error.message);
        }
    }

    console.log(`✅ 정찰 완료: 총 ${allItems.length}개의 보석 같은 뉴스를 발견했습니다.`);
    return allItems;
}

module.exports = crawlGoogleDiscovery;
