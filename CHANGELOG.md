# Changelog

모든 주요 변경 사항을 기록합니다.

---

## [2026-01-28] 성능 최적화

### 🚀 플러그인 최적화 (`jenny-daily-news.php`)

**문제**: Daily News Terminal 페이지 첫 로딩이 너무 느림

**원인 분석**:
- 모든 지난 포스트 조회 쿼리 (`posts_per_page => -1`) - 치명적 병목
- 불필요한 다중 쿼리 (5개 → 1개로 감소 가능)

**해결**:
| 변경 사항 | Before | After |
|----------|--------|-------|
| 지난 뉴스 날짜 로드 | 첫 로딩 시 전체 조회 | **AJAX로 클릭 시에만** |
| 첫 로딩 쿼리 수 | 5개+ | **1개** |
| 체감 속도 | 느림 | **~2초** |

**커밋**: `9b057a3`
```
perf: optimize initial page load speed - lazy load archive dates via AJAX
```

---

### ⚡ 테마 함수 최적화 (`functions.php`)

**문제**: 날씨/환율 API를 10분마다 호출 - 불필요하게 잦음

**해결**:
| 변경 사항 | Before | After |
|----------|--------|-------|
| 날씨/환율 Cron | 10분마다 | **매일 06:00 (베트남 시간)** |
| 캐시 TTL | 10분/60분 | **24시간** |
| 하루 API 호출 | ~144회 | **2회** |
| 에러 로깅 | 없음 | **추가됨** |
| 홈페이지 섹션 캐시 | 10분 | **15분** (안전 마진) |

**커밋**: `d33f89d`
```
feat: add theme functions.php reference with optimized cron schedule
```

---

### 📁 새로 추가된 파일

```
wordpress-theme-reference/
├── functions.php         ← 테마 함수 (최적화됨)
├── functions.backup.php  ← 원본 백업
└── README.md             ← 사용 설명서
```

---

### 🔧 서버 적용 체크리스트

- [ ] `jenny-daily-news.php` → WordPress 플러그인 업로드
- [ ] `functions.php` → 자식 테마 폴더에 업로드
- [ ] wp-admin 접속 (기존 Cron 자동 정리)
- [ ] LiteSpeed 캐시 퍼지 (선택사항)

---

### 📊 성능 측정 결과

| 페이지 | 로딩 시간 |
|--------|----------|
| 메인 페이지 (chaovietnam.co.kr) | 2.44초 |
| Daily News Terminal | **2.02초** ✅ |
