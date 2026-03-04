# Changelog - 2026-01-27

## Jenny Daily News Plugin v2.0.0

### 광고 시스템 추가

#### 새로운 기능

1. **상단 전면 광고**
   - ID: `#jenny-ad-top`
   - 위치: 페이지 최상단 (레이아웃 wrapper 바깥)
   - 크기: 100% 너비, 높이 150~200px

2. **뉴스 4개당 중간 광고**
   - ID 패턴: `#jenny-ad-{섹션키}-1`, `-2`, `-3`...
   - 위치: 각 섹션 내 뉴스 카드 4개마다 삽입
   - 크기: 100% 너비, 높이 150px (모바일 120px)

3. **섹션 끝 광고**
   - ID 패턴: `#jenny-ad-{섹션키}-end`
   - 위치: 각 카테고리 섹션 끝
   - 크기: 100% 너비, 높이 150px (모바일 120px)

4. **사이드바 광고 (PC 전용)**
   - ID: `#jenny-ad-sidebar-1`, `#jenny-ad-sidebar-2`
   - 위치: 화면 오른쪽 고정 (sticky)
   - 표시 조건: 화면 너비 1400px 이상
   - 크기: 160×600px

#### 광고 자리 ID 목록

| 위치 | ID |
|------|-----|
| 상단 전면 광고 | `#jenny-ad-top` |
| 탑뉴스 뒤 광고 | `#jenny-ad-after-topnews` |
| 경제 섹션 4개 후 | `#jenny-ad-economy-1` |
| 경제 섹션 끝 | `#jenny-ad-economy-end` |
| 사회 섹션 4개 후 | `#jenny-ad-society-1` |
| ... (각 섹션별 동일 패턴) | ... |
| 사이드바 광고 1 | `#jenny-ad-sidebar-1` |
| 사이드바 광고 2 | `#jenny-ad-sidebar-2` |

#### Ad Inserter 연동

- 각 광고 자리에 고유 ID 부여
- Ad Inserter에서 CSS 선택자로 타겟팅 가능
- 자체 광고 및 AdSense 모두 지원

### 문서 추가

- `docs/AD_SLOTS_GUIDE.md` - 광고 자리 ID 가이드 문서 추가

### 기술적 변경

- 레이아웃 구조 변경: `jenny-layout-wrapper` (메인 + 사이드바)
- 상단 광고는 wrapper 바깥에 배치 (전체 너비 보장)
- 반응형 CSS 추가 (모바일/태블릿/PC)
- 사이드바 sticky 포지셔닝 적용

---

## 파일 변경 목록

- `wordpress-plugin/jenny-daily-news.php` - v1.9.1 → v2.0.0
- `docs/AD_SLOTS_GUIDE.md` - 신규 생성
