# 변경 사항 (2026-01-17)

## 🏠 부동산 크롤러 추가

### 새로 추가된 크롤러
| 크롤러 | 소스 URL | 카테고리 |
|--------|----------|----------|
| `vnexpress-realestate.js` | https://vnexpress.net/rss/bat-dong-san.rss | Real Estate |
| `cafef-realestate.js` | https://cafef.vn/bat-dong-san.chn | Real Estate |

### 삭제된 크롤러
- `publicsecurity.js` (공안신문) - 크롤링 목록에서 제거

### 수정된 파일
- `lib/crawler-service.js` - 부동산 크롤러 추가, 공안신문 제거
- `app/api/crawl-source/route.js` - 개별 크롤링 API에 부동산 추가
- `app/admin/settings/page.js` - 설정 페이지에 부동산 크롤러 추가

---

## 📊 대시보드 부동산 카테고리 추가

### 수정된 파일
| 파일 | 변경 내용 |
|------|-----------|
| `app/admin/page.js` | 상단 카운터에 Real Estate 추가 |
| `app/admin/category-selector.js` | 카테고리 드롭다운에 Real Estate 추가 |
| `app/admin/batch-actions.js` | 발행 요약에 Real Estate 카운트 추가 |
| `lib/translator.js` | validCategories에 Real Estate 추가 |
| `lib/crawler-service.js` | 부동산 소스는 원본 카테고리 유지 |

---

## ⚡ 번역 속도 개선

### 변경 사항
| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 본문 번역 배치 크기 | 3개 | **10개** |
| 배치 간 딜레이 | 500ms | **200ms** |
| 크롤링 중 번역 배치 | 10개 | **15개** |
| 프롬프트 길이 | ~2000자 | **~300자** |
| 본문 제한 | 5000자 | **3000자** |
| max_tokens | 없음 | **2000** |

### 수정된 파일
- `app/admin/actions.js` - 배치 크기 및 딜레이 조정
- `lib/translator.js` - 프롬프트 최적화, max_tokens 추가
- `lib/crawler-service.js` - 배치 크기 증가

---

## 🔄 백그라운드 번역

### 새로 추가된 파일
- `app/api/batch-translate/route.js` - 백그라운드 번역 API

### 기능
- 페이지를 떠나도 번역이 계속 진행됨
- fetch API 사용으로 요청이 독립적으로 처리
- 완료 시 알림 + 자동 리뷰 페이지 이동

### 수정된 파일
- `app/admin/batch-actions.js` - WorkflowButton에서 백그라운드 API 호출

---

## 🔁 개별 재번역 기능

### 기능
- 번역 실패 항목에 "⚠️ 번역 필요" 라벨 표시
- 🔄 재번역 버튼으로 개별 항목 재시도 가능

### 수정된 파일
- `app/admin/collected-news-list.js` - 재번역 버튼 추가
- `app/admin/selected-news-list.js` - 재번역 버튼 추가

---

## ⏭️ 번역 중복 방지

### 로직
| 상태 | 동작 |
|------|------|
| `COMPLETED` | 무조건 스킵 |
| `DRAFT` + 3개 필드 모두 있음 | 스킵 |
| `DRAFT` + 필드 일부 비어있음 | 번역 시도 |
| `PENDING` | 번역 시도 |

### 통계 반환
```javascript
{
  translatedCount: 5,   // 실제 번역한 수
  skippedCount: 10,     // 이미 완료되어 스킵한 수
  failedCount: 1        // 실패한 수
}
```

### 수정된 파일
- `app/admin/actions.js` - batchTranslateAction 개선

---

## 🖼️ 이미지 중복 수정

### 문제
- Featured Image가 별도로 표시됨
- 본문에도 같은 이미지가 포함되어 중복 표시

### 해결
- Featured Image가 있으면 본문의 첫 번째 이미지만 제거
- 본문 내 다른 이미지는 모두 유지

### 수정된 파일
- `app/admin/news/[id]/translate/translation-form.js` - 미리보기에서 중복 제거
- `lib/publisher.js` - 발행 시 중복 제거

---

## 🏠 Jenny 플러그인 부동산 섹션

### 추가된 설정
| 함수 | 부동산 설정 |
|------|------------|
| `jenny_get_category_order()` | `'부동산' => 4, 'Real Estate' => 4` |
| `jenny_get_sections_keys()` | `'real_estate' => array('Real Estate', '부동산')` |
| `jenny_get_category_map()` | `'Real Estate' => '부동산'` |
| `jenny_get_sections()` | `'🏠 부동산 (Real Estate)'` |
| `jenny_get_section_nav_items()` | `'real_estate' => '부동산', '🏠'` |

### 수정된 파일
- `wordpress-plugin/jenny-daily-news.php`

### ⚠️ 주의
WordPress에 직접 플러그인 파일 업로드 필요!

---

## 📁 파일 목록

### 새로 생성된 파일
- `app/api/batch-translate/route.js`
- `scripts/crawlers/vnexpress-realestate.js`
- `scripts/crawlers/cafef-realestate.js`

### 수정된 파일
- `app/admin/actions.js`
- `app/admin/batch-actions.js`
- `app/admin/category-selector.js`
- `app/admin/collected-news-list.js`
- `app/admin/news/[id]/translate/translation-form.js`
- `app/admin/page.js`
- `app/admin/selected-news-list.js`
- `app/admin/settings/page.js`
- `app/api/crawl-source/route.js`
- `lib/crawler-service.js`
- `lib/publisher.js`
- `lib/translator.js`
- `wordpress-plugin/jenny-daily-news.php`

