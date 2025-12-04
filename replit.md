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

| News Source | Image Upload Status |
|-------------|---------------------|
| VnExpress | ✅ Works |
| InsideVina | ✅ Works |
| TuoiTre | ✅ Works |
| ThanhNien | ✅ Works |
| Yonhap | ❌ SSL error (server issue) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | GPT API key for translation |
| `WORDPRESS_APP_PASSWORD` | WordPress application password |
| `WORDPRESS_URL` | WordPress site URL (default: https://chaovietnam.co.kr) |
| `WORDPRESS_USERNAME` | WordPress username (default: chaovietnam) |
| `DATABASE_URL` | SQLite database path |

## Recent Changes (Dec 4, 2025)

- Added `wordpressMediaId` field to database for image reuse
- Summary posts now reuse uploaded image (no duplicate upload)
- Summary posts have Featured Image set for Jenny plugin
- Added `full_article_url` custom field for direct article linking
- Jenny plugin v1.1: Cards link directly to full article

## Notes

- Yonhap images fail due to SSL negotiation issue on WordPress server
- Existing summary posts (before Dec 4) still link to summary pages
- New summary posts link directly to full articles
