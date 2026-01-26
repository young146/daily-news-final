# 광고 자리 ID 가이드 (Ad Slots Guide)

Jenny Daily News 플러그인 v2.0.0에서 사용하는 광고 자리 ID 목록입니다.

Ad Inserter 등 광고 관리 플러그인에서 CSS 선택자로 타겟팅할 때 사용합니다.

---

## 고정 위치 광고

| 위치 | ID | 권장 사이즈 | 설명 |
|------|-----|------------|------|
| 상단 전면 광고 | `#jenny-ad-top` | 320×250 (모바일) / 970×250 (PC) | 페이지 맨 위, 가장 큰 광고 |
| 탑뉴스 뒤 광고 | `#jenny-ad-after-topnews` | 320×100 (모바일) / 970×90 (PC) | 주요 뉴스 섹션 바로 뒤 |
| 사이드바 광고 1 | `#jenny-ad-sidebar-1` | 160×600 | PC 오른쪽 상단 (sticky, PC 전용) |
| 사이드바 광고 2 | `#jenny-ad-sidebar-2` | 160×600 | PC 오른쪽 하단 (sticky, PC 전용) |

---

## 섹션별 광고

각 뉴스 섹션에서 **뉴스 4개마다** 광고가 삽입되고, **섹션 끝**에도 광고가 있습니다.

### 패턴
- 뉴스 4개 후: `#jenny-ad-{섹션키}-1`
- 뉴스 8개 후: `#jenny-ad-{섹션키}-2`
- 뉴스 12개 후: `#jenny-ad-{섹션키}-3`
- 섹션 끝: `#jenny-ad-{섹션키}-end`

### 섹션별 ID 목록

| 섹션 | 섹션 키 | 4개 후 | 8개 후 | 12개 후 | 섹션 끝 |
|------|---------|--------|--------|---------|---------|
| 📈 경제 | economy | `#jenny-ad-economy-1` | `#jenny-ad-economy-2` | `#jenny-ad-economy-3` | `#jenny-ad-economy-end` |
| 👥 사회 | society | `#jenny-ad-society-1` | `#jenny-ad-society-2` | `#jenny-ad-society-3` | `#jenny-ad-society-end` |
| 🎭 문화/스포츠 | culture | `#jenny-ad-culture-1` | `#jenny-ad-culture-2` | `#jenny-ad-culture-3` | `#jenny-ad-culture-end` |
| 🏠 부동산 | real_estate | `#jenny-ad-real_estate-1` | `#jenny-ad-real_estate-2` | `#jenny-ad-real_estate-3` | `#jenny-ad-real_estate-end` |
| ⚖️ 정치/정책 | politics | `#jenny-ad-politics-1` | `#jenny-ad-politics-2` | `#jenny-ad-politics-3` | `#jenny-ad-politics-end` |
| 🌏 국제 | international | `#jenny-ad-international-1` | `#jenny-ad-international-2` | `#jenny-ad-international-3` | `#jenny-ad-international-end` |
| 🇰🇷🇻🇳 한-베 | korea_vietnam | `#jenny-ad-korea_vietnam-1` | `#jenny-ad-korea_vietnam-2` | `#jenny-ad-korea_vietnam-3` | `#jenny-ad-korea_vietnam-end` |
| 📢 교민소식 | community | `#jenny-ad-community-1` | `#jenny-ad-community-2` | `#jenny-ad-community-3` | `#jenny-ad-community-end` |
| ✈️ 여행 | travel | `#jenny-ad-travel-1` | `#jenny-ad-travel-2` | `#jenny-ad-travel-3` | `#jenny-ad-travel-end` |
| 🏥 건강 | health | `#jenny-ad-health-1` | `#jenny-ad-health-2` | `#jenny-ad-health-3` | `#jenny-ad-health-end` |
| 🍽️ 음식 | food | `#jenny-ad-food-1` | `#jenny-ad-food-2` | `#jenny-ad-food-3` | `#jenny-ad-food-end` |
| ✨ 기타 | other | `#jenny-ad-other-1` | `#jenny-ad-other-2` | `#jenny-ad-other-3` | `#jenny-ad-other-end` |

> **참고**: 뉴스 개수에 따라 `-1`, `-2`, `-3`... 계속 생성됩니다.  
> 예: 경제 뉴스가 20개면 `#jenny-ad-economy-1` ~ `#jenny-ad-economy-4` + `#jenny-ad-economy-end`

---

## Ad Inserter 설정 방법

### 1. 블록 생성
1. WordPress 관리자 → **설정** → **Ad Inserter**
2. 빈 블록 선택 (예: Block 1)
3. 광고 코드(AdSense 또는 자체 배너) 입력

### 2. 위치 설정
1. **Insertion** 탭 클릭
2. **Before element** 또는 **After element** 선택
3. **CSS selector** 입력: `#jenny-ad-top`

### 3. 표시 조건 (선택사항)
- **Pages** 탭에서 특정 페이지만 표시하도록 설정
- **Devices** 탭에서 모바일/PC 구분 가능

### 4. 저장
- **Save Settings** 클릭

---

## 광고 사이즈 권장

### 모바일 (< 768px)
| 용도 | 권장 사이즈 | AdSense 명칭 |
|------|------------|-------------|
| 상단 광고 | 320×250 | Medium Rectangle |
| 중간 광고 | 320×100 | Large Mobile Banner |
| 섹션 끝 광고 | 320×100 | Large Mobile Banner |

### PC (≥ 768px)
| 용도 | 권장 사이즈 | AdSense 명칭 |
|------|------------|-------------|
| 상단 광고 | 970×250 | Billboard |
| 중간 광고 | 970×90 | Large Leaderboard |
| 섹션 끝 광고 | 970×90 | Large Leaderboard |
| 사이드바 | 160×600 | Wide Skyscraper |

---

## 참고사항

- **사이드바 광고**는 화면 너비 1400px 이상에서만 표시됩니다.
- 광고 자리는 HTML 주석 `<!-- Ad Inserter: #ID -->` 로 표시되어 있습니다.
- 플러그인 버전: **2.0.0**

---

*Last updated: 2026-01-27*
