# XinChao Vietnam Daily News System

## Overview
Automated news workflow system for XinChao Vietnam, a 23-year-old Korean-language magazine in Vietnam. The system crawls Vietnamese and Korean news sources, translates them to Korean using GPT API, and publishes to WordPress.

## Architecture

### Tech Stack
- **Frontend/Backend**: Next.js 16 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Translation**: OpenAI GPT API
- **Publishing**: WordPress REST API
- **Port**: 5000

### News Sources
- VnExpress (Vietnamese & English)
- Yonhap News (Korean)
- TuoiTre News
- ThanhNien
- InsideVina
- Public Security News (en.cand.com.vn) - 베트남 공안 신문 영문판
- Saigoneer (kr.saigoneer.com) - 베트남 음식/여행 (한글판, 번역 불필요)
- SoraNews24 - 일본 음식/펫/여행 뉴스 (영문, 2024-2025년만)

### WordPress Publishing
Single publication target on chaovietnam.co.kr:

| Target | Category IDs | Description |
|--------|-------------|-------------|
| 데일리뉴스 (Full Article) | 6, 31 | Complete translated articles |

**참고**: 요약본(카테고리 711) 별도 게시 삭제됨. Jenny 플러그인이 본문에서 직접 excerpt를 가져옴.

### WordPress Plugins (Required)
1. **XinChao Image Uploader** (`xinchao-image-uploader.php`)
   - REST endpoint for server-side image download
   - Bypasses hotlink protection from news sites
   
2. **Jenny Daily News Display** (`jenny-daily-news.php`) v1.3
   - Displays news cards using `[daily_news_list]` shortcode
   - Fetches from category 31 (본문)
   - Uses WordPress excerpt for summary
   - Links directly to full article (permalink)

## Key Files

| File | Purpose |
|------|---------|
| `lib/translator.js` | 통합 번역 모듈 (재시도 3회, 응답 검증) |
| `lib/publisher.js` | WordPress publishing logic |
| `lib/openai.js` | (Deprecated) translator.js로 리다이렉트 |
| `lib/prisma.js` | Database client |
| `app/admin/page.js` | Admin dashboard |
| `app/admin/actions.js` | Server actions for publishing |
| `scripts/crawler.js` | News crawler |

## 일일 워크플로우 (Daily Workflow)

### 1단계: 뉴스 수집 (Collect News)
- 뉴스 소스에서 기사 수집 (매일 오전 7시 자동 또는 수동)
- **제목만 한국어로 자동 번역** (GPT-4o-mini)
- Collected News 목록에 표시

### 2단계: 뉴스 선정 (Select News)
- Collected News에서 제목을 보고 기사 선정 (~20개)
- "선정된 뉴스" 목록으로 이동
- 탑뉴스(Top News) 1개 지정

### 3단계: 번역 및 요약 생성 (Translate & Summarize)
- 선정된 뉴스에 대해 전문 번역 + 요약본 생성 (GPT-4)
- 카테고리 자동 분류 (Society/Economy/Culture/Policy)
- 각 기사별 수정 및 확인 작업

### 4단계: WordPress 발행 (Publish)
- 확인된 모든 기사 일괄 발행
- **본문** → 뉴스/데일리뉴스 (category 6, 31)
- **요약본** → https://chaovietnam.co.kr/daily-news-terminal/
  - Jenny 플러그인이 본문에서 excerpt 자동 추출

### 5단계: 카드 전령 생성 (Card News)
- 탑뉴스를 배경으로 오늘의 뉴스 카드 이미지 생성
- 날씨, 환율 정보 포함 (1200×630 OG 규격)
- WordPress에 업로드 → SNS로 독자에게 공유

### 발행 결과
| 콘텐츠 | 발행 위치 |
|--------|----------|
| 본문 (Full Article) | 뉴스/데일리뉴스 (category 31) |
| 요약본 (Summary) | daily-news-terminal 페이지 |
| 카드 전령 (Card News) | 뉴스 터미널 Featured Image → SNS 공유 |

## Image Handling

| News Source | Image Upload Status | Method |
|-------------|---------------------|--------|
| VnExpress | ✅ Works | WordPress plugin |
| VnExpress VN | ✅ Works | WordPress plugin |
| InsideVina | ✅ Works | WordPress plugin |
| TuoiTre | ✅ Works | WordPress plugin |
| ThanhNien | ✅ Works | WordPress plugin |
| PublicSecurity | ✅ Works | WordPress plugin |
| Saigoneer | ✅ Works | WordPress plugin |
| SoraNews24 | ✅ Works | WordPress plugin |
| Yonhap | ✅ Works | Replit → WordPress (SSL bypass) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | GPT API key for translation |
| `WORDPRESS_APP_PASSWORD` | WordPress application password |
| `WORDPRESS_URL` | WordPress site URL (default: https://chaovietnam.co.kr) |
| `WORDPRESS_USERNAME` | WordPress username (default: chaovietnam) |
| `DATABASE_URL` | SQLite database path |
| `TELEGRAM_BOT_TOKEN` | (선택) 텔레그램 봇 토큰 |
| `TELEGRAM_CHAT_ID` | (선택) 텔레그램 채팅 ID |
| `ADMIN_EMAIL` | 초기 관리자 이메일 (default: admin@chaovietnam.co.kr) |
| `ADMIN_PASSWORD` | 초기 관리자 비밀번호 (default: admin123) |
| `JWT_SECRET` | JWT 토큰 시크릿 키 |

## Authentication System

관리자 페이지 접근을 위한 로그인 시스템이 구현되어 있습니다.

### 로그인
- URL: `/admin/login`
- 첫 로그인 시 환경변수의 ADMIN_EMAIL/ADMIN_PASSWORD로 초기 관리자 계정 자동 생성

### 권한 레벨
| 권한 | 설명 |
|------|------|
| ADMIN | 모든 기능 + 사용자 관리 |
| USER | 뉴스 크롤링, 번역, 게시 (사용자 관리 불가) |

### 사용자 관리
- URL: `/admin/users` (ADMIN 권한만 접근 가능)
- 새 사용자 추가, 삭제 기능
- 권한 설정 (ADMIN/USER)

### 관련 파일
| File | Purpose |
|------|---------|
| `lib/auth.js` | 인증 로직 (JWT, 비밀번호 해시) |
| `middleware.js` | 관리자 페이지 접근 제한 |
| `app/admin/login/page.js` | 로그인 페이지 |
| `app/admin/users/page.js` | 사용자 관리 페이지 |
| `app/api/auth/*` | 인증 API (login, logout, me, users) |

## Card News (카드 엽서)

카드 엽서는 오늘의 주요 뉴스를 SNS 공유용으로 만든 시각적 카드입니다.

### 디자인 (Simple Hero - 1200×630)
- **OG 표준 규격** (1200×630) - SNS 공유에 최적화
- **TopNews 1개만** 크게 표시 (SNS 썸네일에서도 잘 보임)
- 상단: "Xin Chao Vietnam 오늘의 뉴스" + 날짜
- 중앙: 전체 배경 이미지 + 제목(50px) + 요약
- 하단: 물결 곡선 구분선 + 로고 + 서울 날씨 + 환율 (USD, KRW)

### 사용 방법
1. 관리자 대시보드에서 뉴스 선택 후 **"Set as Top"** 클릭
2. `/admin/card-news` 페이지에서 카드 엽서 미리보기
3. **"WordPress에 카드 엽서 게시"** 버튼으로 WordPress에 자동 게시

### 관련 파일
| File | Purpose |
|------|---------|
| `app/admin/card-news/page.js` | 카드 엽서 미리보기 페이지 |
| `app/admin/card-news/CardNewsSimple.js` | Simple Hero 디자인 (현재 사용) |
| `app/admin/card-news/CardNewsPreviewMars.js` | Mars Explorer 디자인 (구버전) |
| `app/api/publish-card-news/route.js` | WordPress 게시 API |

### WordPress 게시 결과
- **뉴스 터미널 페이지**: `https://chaovietnam.co.kr/daily-news-terminal/`
- **Featured Image**: 카드 엽서 JPEG 이미지 (뉴스 터미널 페이지 대표이미지로 설정)
- **OG 이미지**: Featured Image가 SNS 공유 시 미리보기로 표시됨

### SNS 공유 URL
| 플랫폼 | URL | 비고 |
|--------|-----|------|
| Facebook | `https://chaovietnam.co.kr/daily-news-terminal/` | 바로 작동 |
| 카카오톡 | `https://chaovietnam.co.kr/daily-news-terminal/` | 캐시 초기화 필요 시 [카카오 디버거](https://developers.kakao.com/tool/clear/og) 사용 |
| Zalo | `https://chaovietnam.co.kr/daily-news-terminal/?v=날짜` | 예: `?v=1204` (12월4일) |

### 일일 워크플로우
1. 관리자 대시보드에서 뉴스 선택 (TopNews 1개, CardNews 4개)
2. `/admin/card-news` 페이지에서 **"WordPress에 카드 엽서 게시"** 클릭
3. SNS에서 뉴스 터미널 URL 공유

## Recent Changes (Dec 11, 2025)

### Bug Fixes
- **개별 크롤링 제목 번역 추가**: `crawl-source` API에서 제목 번역 누락 수정
  - SoraNews24, VnExpress 등 영문 소스 → GPT로 제목 한글 번역
  - Yonhap, Saigoneer(한글판) → 이미 한글이라 번역 스킵
- **SoraNews24 연도 필터 추가**: 2024-2025년 기사만 수집 (오래된 기사 수집 방지)
- **이미지 도메인 추가**: `media.urbanistnetwork.com`, `soranews24.com`, `en.cand.com.vn` 추가
- **기사 수집 한도 증가**: Saigoneer, SoraNews24 → 10개로 증가 (기존 8개)

### Header Date Fix
- **Hydration 에러 수정**: 날짜 표시 클라이언트 사이드 렌더링으로 변경
- **베트남 시간대 적용**: `Asia/Bangkok` (UTC+7) 시간대 고정

## Previous Changes (Dec 10, 2025)

### News Source Update
- **VNA 소스 삭제**: VNA 웹사이트가 사진 갤러리만 제공하여 본문 추출 불가
- **공안 신문 추가**: en.cand.com.vn (베트남 공안 신문 영문판) 크롤러 추가
  - 정치, 공안, 문화, 경제 섹션 지원
  - 본문 및 이미지 정상 추출

### Code Stability Improvements
- **번역 로직 통합**: `lib/translator.js`로 모든 번역 함수 통합
  - 재시도 로직 3회 추가 (네트워크 오류 대응)
  - 응답 구조 검증 (잘못된 JSON 응답 처리)
  - 에러 추적 (error 필드로 실패 원인 반환)
- **중복 코드 제거**: `app/api/crawl-news/route.js`와 `scripts/crawler.js`가 통합 모듈 사용
- **lib/openai.js 정리**: deprecated 처리, translator.js로 리다이렉트
- **카드뉴스 배경 이미지 수정**: TopNews 이미지를 WordPress에 먼저 업로드 후 안정적인 URL 사용
- **uploadImageToWordPress 함수 export 추가**: 카드뉴스 API에서 사용 가능

## Previous Changes (Dec 9, 2025)

### Crawler Title Translation
- **크롤러에서 제목 자동 번역**: 뉴스 수집 시 GPT-4o-mini로 제목을 한국어로 번역
- 연합뉴스(Yonhap)는 이미 한글이므로 번역 스킵
- **Translate Titles 버튼 제거**: 더 이상 필요 없음
- Collected News에 번역된 제목 표시, 원문은 아래에 작게 표시

## Previous Changes (Dec 5, 2025)

### Bug Fixes & Stability Improvements
- **번역 함수 오류 수정**: `translateItemAction`에서 함수 호출 시그니처 수정
  - 기존: `translateNewsItem(item)` → 수정: `translateNewsItem(title, summary, content)`
- **카드뉴스 배포 호환성**: localhost URL 하드코딩 제거
  - 환경변수 기반 URL 설정으로 변경 (REPLIT_DEV_DOMAIN, NEXT_PUBLIC_BASE_URL)
- **크롤러 안정성 개선**: `Promise.all` → `Promise.allSettled`
  - 개별 소스 실패 시에도 다른 소스 크롤링 계속
  - 실패/성공 소스 로그에 상세 기록
  - 상태 표시: SUCCESS | PARTIAL | FAILED
- **크롤러 에러 추적 기능**: 실패 이유 상세 저장 및 조회
  - `CrawlerLog.errorDetails` 필드 추가 (JSON)
  - 설정 페이지에서 에러 상세 확인 가능 (클릭하여 펼치기)
  - 에러 메시지, 스택 트레이스, 발생 시간 기록

### Earlier (Dec 5)
- **카드 엽서 새 디자인**: Simple Hero 스타일 (1200×630)
  - TopNews 1개만 크게 표시, SNS 썸네일에서도 제목이 잘 보임
  - 4개 카드 그리드 제거 → 단일 히어로 레이아웃
- **설정 페이지 개선**: 오늘 발행된 뉴스 관리 섹션 추가
- **버튼 깜빡임 수정**: Translate & Generate 버튼 애니메이션 제거
- **뉴스 삭제 기능**: 각 뉴스 항목에 🗑️ 삭제 버튼 추가
- **요약본 게시 제거**: 본문만 WordPress에 게시 (카테고리 31)
- **Jenny 플러그인 v1.5**: 날씨(3도시) + 환율 위젯 추가

### Dec 4, 2025
- **Yonhap SSL fix**: Images downloaded via Replit first, then uploaded to WordPress
- **VNA crawler fix**: SSL legacy support enabled
- **Card News WordPress 게시**: 카드 엽서를 WordPress에 직접 게시하는 기능 추가
- **카드 엽서 JPEG 변환**: PNG → JPEG (92% 품질), 파일 크기 86% 감소 (2.4MB → 339KB)
- **뉴스 터미널 대표이미지**: 카드 엽서가 뉴스 터미널 페이지의 Featured Image로 설정
- **SNS 공유 성공**: Facebook, 카카오톡, Zalo 모두 OG 이미지 표시 확인

## Documentation

| 문서 | 설명 |
|------|------|
| `docs/CRAWLER_MAINTENANCE.md` | 크롤러 유지보수 가이드 (셀렉터 수정, 에러 해결) |
| `docs/VPS_DEPLOYMENT.md` | VPS 배포 가이드 (PM2, Nginx, Cron 설정) |

## Telegram Notifications

크롤러 실행 결과를 텔레그램으로 알림 받을 수 있습니다.

### 설정 방법
1. `@BotFather`에서 봇 생성 → 토큰 저장
2. 봇에게 `/start` 메시지 전송
3. `https://api.telegram.org/bot[TOKEN]/getUpdates`에서 chat_id 확인
4. 환경변수 설정: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

### 알림 내용
- 크롤러 실행 결과 (성공/부분실패/실패)
- 저장된 뉴스 개수
- 실패한 소스 및 에러 메시지

## Notes

- All 7 news sources now working with images
- Card news uses client-side html2canvas for image generation (Puppeteer not available)
- Telegram notifications are optional (works without configuration)
