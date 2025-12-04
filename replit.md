# XinChao Vietnam Daily News System

## Overview
Automated news workflow system for XinChao Vietnam, a 23-year-old Korean-language magazine in Vietnam. The system crawls Vietnamese and Korean news sources, translates them to Korean using GPT API, and publishes to WordPress.

## Architecture

### Tech Stack
- **Frontend/Backend**: Next.js 16 (App Router)
- **Database**: SQLite with Prisma ORM
- **Translation**: OpenAI GPT API
- **Publishing**: WordPress REST API
- **Port**: 5000

### News Sources
- VnExpress (Vietnamese & English)
- Yonhap News (Korean)
- TuoiTre News
- ThanhNien
- InsideVina
- VNA

### WordPress Publishing
Two publication targets on chaovietnam.co.kr:

| Target | Category IDs | Description |
|--------|-------------|-------------|
| 데일리뉴스 (Full Article) | 6, 31 | Complete translated articles |
| 데일리뉴스 요약본 (Summary) | 6, 711 | AI-generated summaries for news terminal |

### WordPress Plugins (Required)
1. **XinChao Image Uploader** (`xinchao-image-uploader.php`)
   - REST endpoint for server-side image download
   - Bypasses hotlink protection from news sites
   
2. **Jenny Daily News Display** (`jenny-daily-news.php`) v1.1
   - Displays summary cards using `[daily_news_list]` shortcode
   - Links directly to full article (via `full_article_url` meta)

## Key Files

| File | Purpose |
|------|---------|
| `lib/publisher.js` | WordPress publishing logic |
| `lib/openai.js` | GPT translation |
| `lib/prisma.js` | Database client |
| `app/admin/page.js` | Admin dashboard |
| `app/admin/actions.js` | Server actions for publishing |
| `scripts/crawler.js` | News crawler |

## Publishing Workflow

1. **Crawl** → Fetch news from sources (8am daily)
2. **Select** → Admin selects ~20 articles
3. **Translate** → GPT translates to Korean
4. **Publish Main** → Full article to 데일리뉴스 (category 31)
   - Image uploaded to WordPress Media Library
   - Featured image set
5. **Publish Summary** → Summary to 요약본 (category 711)
   - Reuses uploaded image (no duplicate upload)
   - Featured image set for Jenny plugin
   - `full_article_url` meta saved for direct linking

## Image Handling

| News Source | Image Upload Status | Method |
|-------------|---------------------|--------|
| VnExpress | ✅ Works | WordPress plugin |
| VnExpress VN | ✅ Works | WordPress plugin |
| InsideVina | ✅ Works | WordPress plugin |
| TuoiTre | ✅ Works | WordPress plugin |
| ThanhNien | ✅ Works | WordPress plugin |
| VNA | ✅ Works | WordPress plugin |
| Yonhap | ✅ Works | Replit → WordPress (SSL bypass) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | GPT API key for translation |
| `WORDPRESS_APP_PASSWORD` | WordPress application password |
| `WORDPRESS_URL` | WordPress site URL (default: https://chaovietnam.co.kr) |
| `WORDPRESS_USERNAME` | WordPress username (default: chaovietnam) |
| `DATABASE_URL` | SQLite database path |

## Card News (전령 카드/카드 엽서)

카드 엽서는 오늘의 주요 뉴스를 한눈에 보여주는 시각적 카드입니다.

### 구성 요소
- **특집 뉴스 (TopNews)**: 왼쪽 60% 영역, 큰 이미지와 제목
- **카드 뉴스 (4개)**: 오른쪽 40% 영역, 4개의 작은 카드
- **날씨/환율 정보**: 하단 푸터 영역

### 사용 방법
1. 관리자 대시보드에서 뉴스 선택 시 `isTopNews`, `isCardNews` 지정
2. `/admin/card-news` 페이지에서 카드 엽서 미리보기
3. **"WordPress에 카드 엽서 게시"** 버튼으로 WordPress에 자동 게시

### 관련 파일
| File | Purpose |
|------|---------|
| `app/admin/card-news/page.js` | 카드 엽서 미리보기 페이지 |
| `app/admin/card-news/CardNewsPreviewMars.js` | Mars Explorer 디자인 |
| `app/api/publish-card-news/route.js` | WordPress 게시 API |
| `lib/publisher.js` | `publishCardNewsToWordPress()` 함수 |

### WordPress 게시 결과
- **카테고리**: 뉴스 > 데일리뉴스 (6, 31)
- **제목**: "📰 YYYY년 M월 D일 데일리뉴스 카드"
- **Featured Image**: 카드 엽서 PNG 이미지
- **링크**: 전체 뉴스 목록 페이지로 연결

## Recent Changes (Dec 4, 2025)

- Added `wordpressMediaId` field to database for image reuse
- Summary posts now reuse uploaded image (no duplicate upload)
- Summary posts have Featured Image set for Jenny plugin
- Added `full_article_url` custom field for direct article linking
- Jenny plugin v1.1: Cards link directly to full article
- **Yonhap SSL fix**: Images downloaded via Replit first, then uploaded to WordPress
- **VNA crawler fix**: SSL legacy support enabled
- **Card News WordPress 게시**: 카드 엽서를 WordPress에 직접 게시하는 기능 추가

## Notes

- All 7 news sources now working with images
- Existing summary posts (before Dec 4) still link to summary pages
- New summary posts link directly to full articles
- Card news uses client-side html2canvas for image generation (Puppeteer not available)
