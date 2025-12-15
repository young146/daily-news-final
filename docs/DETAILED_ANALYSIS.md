# 프로젝트 상세 분석 문서

## 1. 탑뉴스 지정 관계 (isTopNews vs isSelected)

### 필드 관계도

```
NewsItem 모델:
├── isSelected (Boolean)      → "선정된 뉴스" 리스트에 포함 여부
│   └── true: 관리자가 "선정된 뉴스"로 선택한 모든 뉴스
│
└── isTopNews (Boolean)        → "최상위 탑뉴스" 지정 (1개만 가능)
    └── true: isSelected=true 중에서 "★ TOP NEWS"로 지정된 단 하나의 뉴스
```

### 워크플로우

1. **수집 단계** (`CollectedNewsList`)
   - 크롤러가 수집한 뉴스들이 `isSelected=false` 상태로 저장
   - 관리자가 "Add to Top" 버튼 클릭 → `isSelected=true`로 변경

2. **선정 단계** (`SelectedNewsList`)
   - `isSelected=true`인 모든 뉴스가 "선정된 뉴스" 섹션에 표시
   - 이 중에서 "☆ Set as Top" 버튼으로 `isTopNews=true` 지정 가능
   - **제약조건**: `isTopNews=true`는 최대 2개까지만 허용 (코드: `app/admin/page.js:75`)

3. **발행 단계**
   - `isTopNews=true`인 뉴스는 Jenny 플러그인에서 "🔥 주요 뉴스" 섹션에 표시
   - `isSelected=true && !isTopNews`인 뉴스는 카테고리별 섹션에 표시

### 코드 위치

```javascript
// app/admin/page.js
async function toggleTopNews(formData) {
    const id = formData.get('id');
    const item = await prisma.newsItem.findUnique({ where: { id } });
    
    if (item.isTopNews) {
        // 이미 탑뉴스면 해제
        await prisma.newsItem.update({ where: { id }, data: { isTopNews: false } });
    } else {
        // 탑뉴스가 2개 미만일 때만 설정 가능
        const count = await prisma.newsItem.count({
            where: { isTopNews: true, status: { notIn: ['PUBLISHED', 'ARCHIVED'] } }
        });
        if (count < 2) {
            await prisma.newsItem.update({ where: { id }, data: { isTopNews: true } });
        }
    }
}
```

### 관계 요약

- **isSelected**: 선정 여부 (다수 가능)
- **isTopNews**: 탑뉴스 지정 (최대 2개, isSelected의 하위 개념)
- **isCardNews**: 카드뉴스 선정 (별도, 탑뉴스와 독립적)

---

## 2. 탑뉴스 배치 → WordPress Plugin Jenny

### 데이터 흐름

```
Next.js Admin → WordPress API → Jenny Plugin
```

### 1단계: Next.js에서 WordPress로 발행

**파일**: `lib/publisher.js` - `publishToMainSite()`

```javascript
// WordPress Post Meta에 저장되는 필드들:
postData.meta = {
    is_top_news: item.isTopNews ? '1' : '0',      // ← Jenny가 이걸 읽음
    news_category: item.category,                   // 카테고리 (Society, Economy 등)
    news_source: item.source,                       // 출처 (VnExpress, Yonhap 등)
    news_original_url: item.originalUrl            // 원문 링크
}
```

### 2단계: Jenny Plugin에서 탑뉴스 읽기

**파일**: `wordpress-plugin/jenny-daily-news.php`

```php
// 라인 196: WordPress Post Meta에서 is_top_news 읽기
$is_top = get_post_meta($post_id, 'is_top_news', true);

// 라인 208-212: 탑뉴스와 일반 뉴스 분리
if ($is_top) {
    $top_news_posts[] = $item;  // 탑뉴스 배열에 추가
} else {
    $regular_posts[] = $item;   // 일반 뉴스 배열에 추가
}
```

### 3단계: Jenny Plugin에서 탑뉴스 표시

**파일**: `wordpress-plugin/jenny-daily-news.php` - 라인 372-391

```php
// 🔥 주요 뉴스 섹션 렌더링
if (!empty($top_news_posts)) {
    $output .= '<h2 class="jenny-section-title">🔥 주요 뉴스</h2>';
    $output .= '<div class="jenny-top-news-row">';  // 2열 그리드
    
    $top_count = 0;
    foreach ($top_news_posts as $post) {
        if ($top_count >= 2) {
            // 2개 초과 시 일반 뉴스로 이동
            $regular_posts[] = $post;
            continue;
        }
        $output .= render_jenny_card($post, $category_map);
        $top_count++;
    }
    $output .= '</div>';
}
```

### 탑뉴스 배치 규칙

1. **Jenny Plugin에서 표시되는 탑뉴스**: 최대 2개
2. **2개 초과 시**: 나머지는 일반 뉴스로 자동 이동
3. **표시 위치**: "🔥 주요 뉴스" 섹션 (2열 그리드)
4. **정렬**: 카테고리 순서 우선, 그 다음 날짜 내림차순

### 카테고리별 배치

**파일**: `wordpress-plugin/jenny-daily-news.php` - 라인 397-454

```php
$sections = array(
    'economy' => array('title' => '📈 경제 (Economy)', 'keys' => array('Economy', '경제')),
    'society' => array('title' => '👥 사회 (Society)', 'keys' => array('Society', '사회')),
    'culture' => array('title' => '🎭 문화/라이프 (Culture)', 'keys' => array('Culture', '문화')),
    'politics' => array('title' => '⚖️ 정치/정책 (Politics)', 'keys' => array('Politics', 'Policy', '정치', '정책')),
    'international' => array('title' => '🌏 국제 (International)', 'keys' => array('International', '국제')),
    'korea_vietnam' => array('title' => '🇰🇷🇻🇳 한-베 관계 (Korea-Vietnam)', 'keys' => array('Korea-Vietnam', '한-베', '한베')),
    'community' => array('title' => '📢 교민 소식 (Community)', 'keys' => array('Community', '교민', '교민소식')),
);
```

---

## 3. 뉴스 본문 위 출처/날짜/원문 보기 링크

### WordPress 본문에 삽입되는 출처 정보

**파일**: `lib/publisher.js` - `generateSourceAttribution()`

```javascript
function generateSourceAttribution(item) {
    const dateStr = item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('ko-KR') : new Date().toLocaleDateString('ko-KR');
    const sourceName = item.source || 'Unknown';

    return `
    <div class="news-source-header">
        <div class="news-source-info"><strong>📰 출처:</strong> ${sourceName}</div>
        <div class="news-source-info"><strong>📅 날짜:</strong> ${dateStr}</div>
        ${item.originalUrl ? `<div style="margin-top: 8px;"><a href="${item.originalUrl}" target="_blank" rel="noopener noreferrer" class="news-source-link-btn">🌐 원문 기사 전체 보기</a></div>` : ''}
    </div>`;
}
```

### WordPress 본문 구조

**파일**: `lib/publisher.js` - `publishToMainSite()` (라인 265-385)

```javascript
// 최종 본문 구조:
finalContent = 
    sourceAttribution +           // ← 출처/날짜/원문 링크 (맨 위)
    bodyStyle +                   // ← 다크모드 스타일
    imageHtml +                   // ← 이미지 (있는 경우)
    translatedContent +           // ← 번역된 본문
    '</div>';
```

### Jenny Plugin 카드의 메타라인

**파일**: `wordpress-plugin/jenny-daily-news.php` - `render_jenny_card()` (라인 337-346)

```php
// 카드 내 메타라인: 출처 | 날짜 | 원문 보기
$meta_line = '<div class="jenny-meta-line">';
$meta_line .= '<span class="jenny-source">' . esc_html($news_source) . '</span>';
$meta_line .= '<span class="jenny-separator">|</span>';
$meta_line .= '<span class="jenny-date">' . $date_str . '</span>';
if (!empty($original_url)) {
    $meta_line .= '<span class="jenny-separator">|</span>';
    $meta_line .= '<a href="' . esc_url($original_url) . '" target="_blank" rel="noopener noreferrer" class="jenny-original-link">원문 보기</a>';
}
$meta_line .= '</div>';
```

### 데이터 소스

**WordPress Post Meta에서 읽어오는 값들**:

```php
// wordpress-plugin/jenny-daily-news.php - 라인 325-335
$news_source = get_post_meta($post_data['post_id'], 'news_source', true);
$original_url = get_post_meta($post_data['post_id'], 'news_original_url', true);
$date_str = get_the_date('Y.m.d', $post_data['post_id']);
```

**Next.js에서 WordPress로 저장**:

```javascript
// lib/publisher.js - 라인 346-354
if (item.source) {
    postData.meta.news_source = item.source;
}
if (item.originalUrl) {
    postData.meta.news_original_url = item.originalUrl;
}
```

### 표시 위치 비교

| 위치 | 형식 | 파일 |
|------|------|------|
| **WordPress 본문** | 박스 형태 (출처/날짜/원문 버튼) | `lib/publisher.js:197-249` |
| **Jenny 카드** | 한 줄 메타라인 (출처\|날짜\|원문 링크) | `jenny-daily-news.php:337-346` |

---

## 4. 다크 모드로 인한 글씨 감춤 → Jenny 뉴스 분류 섹션 표시

### 문제점

**현재 Jenny Plugin 스타일** (`wordpress-plugin/jenny-daily-news.php`):

```php
// 라인 571-580: 뉴스 분류 배지 (Badge)
.jenny-badge {
    position: absolute; top: 12px; left: 12px;
    background: #000000;        // ← 검은 배경
    color: #ffffff;            // ← 흰 글씨
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 700;
    border-radius: 0;
    text-transform: uppercase;
}
```

**문제**: 다크 모드에서 배경이 검은색이면 배지가 보이지 않음!

### 다크 모드 대응 현황

#### ✅ WordPress 본문 (해결됨)

**파일**: `lib/publisher.js` - 라인 214-220

```css
@media (prefers-color-scheme: dark) {
    .news-source-header {
        background: #1f2937;      /* 다크 배경 */
        color: #e5e7eb !important;  /* 밝은 글씨 */
        border-left-color: #60a5fa;
    }
}
```

#### ❌ Jenny Plugin 배지 (미해결)

**현재 상태**: 다크 모드 스타일이 없음

```css
.jenny-badge {
    background: #000000;  /* 항상 검은색 */
    color: #ffffff;       /* 항상 흰색 */
}
```

### 해결 방안

**Jenny Plugin에 다크 모드 스타일 추가 필요**:

```css
.jenny-badge {
    position: absolute; top: 12px; left: 12px;
    background: #000000;
    color: #ffffff;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 700;
    border-radius: 0;
    text-transform: uppercase;
}

/* 다크 모드 대응 */
@media (prefers-color-scheme: dark) {
    .jenny-badge {
        background: #ffffff;      /* 다크 모드에서는 흰 배경 */
        color: #000000;            /* 다크 모드에서는 검은 글씨 */
        border: 1px solid #e5e7eb; /* 테두리 추가로 가시성 향상 */
    }
}
```

### 추가로 확인할 스타일 요소

**Jenny Plugin의 다른 다크 모드 영향 요소**:

1. **섹션 제목** (`.jenny-section-title`) - 라인 507-514
   - 현재: `color: #111827;` (항상 검은색)
   - 다크 모드 대응 필요

2. **카드 제목** (`.jenny-title`) - 라인 592-600
   - 현재: `color: #111827 !important;` (항상 검은색)
   - 다크 모드 대응 필요

3. **메타라인** (`.jenny-meta-line`) - 라인 608-627
   - 현재: `color: #6b7280;` (회색)
   - 다크 모드에서 더 밝게 조정 필요

### 권장 수정 사항

**파일**: `wordpress-plugin/jenny-daily-news.php` - `jenny_get_styles()` 함수에 추가

```css
/* 다크 모드 전체 대응 */
@media (prefers-color-scheme: dark) {
    /* 배지 */
    .jenny-badge {
        background: #ffffff;
        color: #000000;
        border: 1px solid #e5e7eb;
    }
    
    /* 섹션 제목 */
    .jenny-section-title {
        color: #e5e7eb !important;
    }
    
    /* 카드 제목 */
    .jenny-title {
        color: #e5e7eb !important;
    }
    .jenny-title a {
        color: #e5e7eb !important;
    }
    
    /* 메타라인 */
    .jenny-meta-line {
        color: #9ca3af !important;
    }
    .jenny-source {
        color: #e5e7eb !important;
    }
    
    /* 요약 */
    .jenny-excerpt {
        color: #d1d5db !important;
    }
    
    /* 카드 배경 */
    .jenny-news-card {
        background: #1f2937 !important;
    }
}
```

---

## 요약

### 1. 탑뉴스 지정 관계
- `isSelected`: 선정 여부 (다수 가능)
- `isTopNews`: 탑뉴스 지정 (최대 2개, isSelected의 하위 개념)
- Next.js Admin → WordPress Meta (`is_top_news`) → Jenny Plugin

### 2. 탑뉴스 배치 → Jenny Plugin
- WordPress Post Meta `is_top_news` 필드로 전달
- Jenny Plugin이 "🔥 주요 뉴스" 섹션에 최대 2개 표시
- 초과분은 일반 뉴스로 자동 이동

### 3. 출처/날짜/원문 링크
- **WordPress 본문**: 박스 형태로 본문 상단에 삽입
- **Jenny 카드**: 메타라인 형태로 제목 아래 표시
- 둘 다 WordPress Post Meta (`news_source`, `news_original_url`)에서 읽음

### 4. 다크 모드 글씨 감춤 문제
- **현재**: Jenny Plugin 배지가 다크 모드에서 보이지 않음
- **해결**: `@media (prefers-color-scheme: dark)` 스타일 추가 필요
- **영향 요소**: 배지, 섹션 제목, 카드 제목, 메타라인 등

