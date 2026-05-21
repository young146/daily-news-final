# 마케팅 깔때기 진행표

> **목적**: 마케팅 작업이 메인 깔때기 어디에 위치하는지 *항상* 추적해서 길 잃지 않게 한다.
> 매 작업 시작 시 이 파일을 열고 "지금 어디서 무엇을 하는가" 1줄 확인 후 진행.
>
> **관련 문서:**
> - 전략: [씬짜오 디지털 마케팅 활성화 방안.md](../../chao-vn-app/chao-vn-app/씬짜오%20디지털%20마케팅%20활성화%20방안.md)
> - 측정 인프라 진행: [PROGRESS_MEASUREMENT_INFRA.md](../../chao-vn-app/chao-vn-app/PROGRESS_MEASUREMENT_INFRA.md)
> - **빌드 미수 추적**: [PROGRESS_BUILD_PENDING.md](../../chao-vn-app/chao-vn-app/PROGRESS_BUILD_PENDING.md) — *OTA 발송 전 반드시 확인*
> - 에이전트 작업 지침: [CLAUDE.md](../../chao-vn-app/chao-vn-app/CLAUDE.md) — 빌드 vs OTA 의사결정 가이드 포함
>
> 시작: 2026-05-21
> 최종 갱신: 2026-05-21

---

## 🎯 메인 라인 (Main Funnel)

```
이메일 구독자 6,073명
        ↓ (앱 다운로드 유도)
앱 다운로드 (~2,000명 추정)
        ↓ (회원가입 유도)
앱 회원가입 584명
        ↓ (재방문 유도)
앱 retention (MAU)
```

**핵심 통찰:** 마케팅 문서 §0 진단 — *외부 신규 유입보다 내부 자산 전환이 ROI 높음*. 위 깔때기를 *다지는 게* 1순위.

---

## 📍 메인 라인 진행 상태

| 단계 | 현재 상태 | 다음 보강 |
|---|---|---|
| **1. 이메일 → 앱 다운로드 유도** | 🟢 다중 강화 완료 (상단 배너 + 통합 QR + 신규 채용/부동산 섹션 + 측정) | 1주 후 GA4 컨버전율 측정 → 약점 보강 |
| **2. 앱 다운로드 → 회원가입** | 🟢 보강 완료 (B + A v1/v2 + C 1·2차 + 4개 가입 경로 환영 통일) | 1주 후 가입 전환율 측정 |
| **3. 앱 회원가입 → retention** | 🟡 측정 인프라 OK, 데이터 대기 | Firebase Analytics retention 코호트 며칠 후 |
| **4. 외부 유입 (한인커뮤니티 등)** | ⏭️ 메인 다진 후 진행 | 한인회·교회·학교 협력 |

---

## ✅ 완료 작업 (메인 라인)

### 단계 1. 이메일 → 앱 다운로드 유도
- ✅ **이메일 통합 QR 1개로 변경** (PromoCard 6) — 안드로이드/iOS QR 분리 → OS 자동 감지 통합 페이지 1개로
  - 가리키는 URL: `chaovietnam-login.web.app/go/app` (Firebase Hosting OS 자동 분기 페이지)
  - UTM 자동 부착: `utm_source=email&utm_medium=newsletter&utm_content=app_qr|app_link`
- ✅ **앱 카드 "자세히 보기" 버튼 생략** (`category==='app'` 분기) — description 안에 자체 CTA 있으므로 중복 제거
- ✅ **OS 자동 감지 페이지에 GA4 태그** 추가 — 이메일→앱 클릭 측정 가능
- ✅ **이메일 상단 1줄 배너 추가** (2026-05-21) — 헤더 직후. "왜 앱인가" (실시간/푸시) 메시지. utm_content=email_top_banner. 하단 PromoCard와 메시지 분리 (why/how)
- ✅ **측정 인프라 Phase 1~4 완료** (코드 100%) — [PROGRESS_MEASUREMENT_INFRA.md](../../chao-vn-app/chao-vn-app/PROGRESS_MEASUREMENT_INFRA.md)

### 단계 2. 앱 다운로드 → 회원가입 (진단 완료 2026-05-21)

**70% 누수 원인 가설 (코드 분석 결과):**

1. **🔴 비회원 모드가 기본** — `App.js:1579`에서 `(user || isVisitor)` 분기. `isVisitor=true` 기본값. 가입 없이 뉴스/구인/부동산/당근 *100% 접근 가능* → 가입할 *이유 없음*
2. **🔴 가입 후 보상 없음** — 가입 완료 → LoginScreen 복귀 → **8초 후** "프로필 채우세요" *잔소리* 팝업 (`App.js:1643-1666`). 가입 직후 *왜 가입했는지* 보상이 없음 ("aha moment" 부재)
3. **🟡 실명 강제** (`SignupScreen.js:55`) — 베트남 한인이 익명 선호 가능. 닉네임 우선 가입이 친화적
4. **🟡 카카오 이메일 숨김** (`AuthContext.js:359`) — 더미 이메일 자동 생성 → 사용자 혼란

**보강 작업 후보 (ROI 순):**
- A. **가입 후 aha moment 추가** — 가입 직후 *맞춤 가치 1개* 즉시 노출 (예: "당신 지역 새 채용 N건", "푸시 알림 켜기")
- B. **닉네임 우선 가입** — 실명은 프로필 완성 단계로 미룸
- C. **비회원 모드 가벼운 제약** — 알림 신청·즐겨찾기·댓글 등 *액션*은 가입 유도 (콘텐츠 읽기는 유지)
- D. 카카오 이메일 숨김 UX 보완 (수동 입력 폼)

**진행 상태 (2026-05-21):**
- ✅ **B 완료** — `SignupScreen.js`: name 필수→선택, 닉네임 의미로 단일화. displayName 입력란 제거. 실명은 추후 프로필 완성에서.
- ✅ **A v1 완료** — `App.js:1644` "프로필 작성하세요" 잔소리 → "환영 + 가치 명확화 + 1분 설정". 8초→3초 단축. (v2: 전용 환영 화면 + 실제 콘텐츠 미리보기는 다음 세션)
- ✅ **C 진행 중 (1차 완료)** — 재사용 helper `hooks/useRequireAuth.js` 도입. 일관된 가입 유도 모달.
  - `NotificationSettingScreen.js`: 알림 토글 silent fail → 가입 유도 (액션 라벨 "알림 받기")
  - `ItemDetailScreen.js:handleChat`: 채팅 silent return → 가입 유도 ("판매자와 채팅")
  - 다음 라운드: 메시지 전송(`ChatRoomScreen.js`), 댓글, 게시물 작성 등 점진 적용
- ⏭️ D 후순위 (edge case)

**작업 C 설계 노트 (다른 개발자 인수인계용):**
- 비회원 처리 패턴이 *4가지* 공존하던 상태 → `useRequireAuth` hook 으로 통일
- 새 액션 보강 시 표준 패턴: `if (!requireAuth('액션명')) return;`
- 메시지 톤: 부정형 X, 가치 중심 ("X 받으려면 가입 필요"), 시간 약속 ("30초")
- 메인 라인 안 작업. 트래픽 vs 정보 균형 원칙 구현체 ([[project_traffic_vs_info_balance]])

---

## ⏭️ 보류 (메인 라인 ROI 낮음)

| 항목 | 보류 사유 | 재검토 시점 |
|---|---|---|
| **이메일 세그먼트 분할 (액션 2)** | 매칭률 0.6%. 99.4%가 미설치자로 분류 = 사실상 일괄 발송과 동일 | 매칭률 개선 방안 후 |

---

## 🚫 별도 트랙 (메인 외 작업)

> 메인 깔때기 다진 후 진행. 지금은 *건드리지 않음*.

| 항목 | 분류 | 메모 |
|---|---|---|
| jobs-crm 매일 매칭 이메일 (구직자 28명) | retention 깔때기 | 데이터 모인 후. 49명/87건 시동 단계 |
| jobs-crm 데이터 모으기 채널 | 별도 사업 | 메인 다진 후 |
| 광고주 미디어킷 v1 (액션 11) | B2B 수익화 | 메인 측정 데이터 확보 후 |
| 한인커뮤니티 침투 (액션 6~10) | 외부 유입 | 30~60일 차 |
| 카톡방 자체 성장 캠페인 (액션 10) | 채널 확장 | 후순위 |

---

## 🪵 작업 로그 (최신순)

- `2026-05-21` — **작업 C 5차 + 별도 트랙 문서화** — JobsScreen/RealEstateScreen/XinChaoDanggnScreen/MoreScreen 4곳 추가 통일 (inline Alert → hook). 별도 트랙으로 광고주 미디어킷 v1 + 매장 QR 스티커 가이드 v1 작성 (chao-vn-app/marketing/). 추천 프로그램 v1은 비즈니스 특수성(잡지 이미 무료·광고=정보) 반영 재설계했으나 사용자 검토 보류 (파일은 디스크 유지). 이메일 발송 모니터링 알림 추가 시도했으나 SendGrid 100% 성공률·바운스 자동 제외 = 과잉 방어로 되돌림.
- `2026-05-21` — **PR 검토 후 위험 패치** — `남의 코드 시각`으로 변경 전체 재검토. useRequireAuth optional chaining 안전화 + WelcomeAfterSignupScreen logEvent try/catch + ProfileScreen pickImage 가드 + LoginScreen i18n defaultValue 통일. @babel/parser 16개 파일 syntax 검증 통과. ChatList 비회원 화면에 가입 버튼 추가 (MyItems/MyFavorites는 이미 충분).
- `2026-05-21` — **단계 1 추가 보강** — 이메일에 "오늘의 새 채용·부동산 N건" 섹션 추가. Firestore Jobs/RealEstate 24h 카운트 → 본문 + "앱에서 보기" CTA. lib/firebase-admin.js getFirestore() export 추가. fail-safe (실패 시 섹션만 생략).
- `2026-05-21` — **작업 A v2 + 소셜 통일 완료** — WelcomeAfterSignupScreen 신규 (풀스크린 환영 + 4 카테고리 + 푸시 알림 통합). 이메일/Google/Apple/Kakao 4개 가입 경로 모두 환영 화면 경유. isNewSignup flag로 분기. RootNavigator "환영" 스택 등록.
- `2026-05-21` — **작업 C 2차 완료** — 4곳 추가 통일 (ChatRoom 메시지·찜·게시물·리뷰). 4가지 공존 패턴 → useRequireAuth hook 단일화.
- `2026-05-21` — **작업 C 1차 완료** — `useRequireAuth` helper hook 도입 + 알림 설정 토글 + 채팅 시작에 가입 유도 모달 박음. 비회원 액션 silent fail/return 패턴 제거. 모두 OTA-safe (native 추가 X).
- `2026-05-21` — **defensive load + 빌드/OTA 가이드 + 미빌드 추적표 도입** — `lib/analytics.js` 동적 require 로 변경. `PROGRESS_BUILD_PENDING.md` 신규. `CLAUDE.md/AGENTS.md/GEMINI.md` 의사결정 가이드 추가. EAS Update production 1차 발송 (group `9466e6ec-...`).
- `2026-05-21` — **작업 B 완료** + **작업 A v1 완료** — 닉네임 우선 가입 (SignupScreen.js) + 가입 후 환영/가치 명확화 (App.js, 8→3초).
- `2026-05-21` — **단계 2 코드 진단 완료**. 70% 누수 가설 도출: ①비회원 모드 기본 (100% 접근), ②가입 후 aha moment 부재. 보강 작업 후보 A~D 우선순위 정리.
- `2026-05-21` — **단계 1 보강**: 이메일 상단 1줄 배너 추가. "왜 앱인가" 메시지로 본문만 읽고 나가는 사용자도 잡음.
- `2026-05-21` — **점프 사고 → 진행표 도입**. jobs-crm 매일 매칭 이메일 작업 시작했다가 사용자 지적. 메인 깔때기 가드레일 작성으로 재발 차단.
- `2026-05-21` — 이메일 세그먼트 분할 dry-run. 매칭 35명/6,073 (0.6%). Phase B 보류.
- `2026-05-21` — PromoCard 6 통합 QR + go/app GA4 태그 + 앱 카드 자세히 보기 생략. 깔때기 단계 1 마무리.
- `2026-05-21` — 측정 인프라 Phase 1~4 완료 확인 (이전 세션 결과). 단계 1 측정 준비됨.

---

## 🧭 매 작업 시작 전 체크리스트 (필수)

1. **이 파일을 연다**
2. 메인 라인 표(§"메인 라인 진행 상태")에서 *지금 단계*가 어딘지 확인
3. 진행하려는 작업이 *메인 라인 안*인가? → 진행
4. 메인 라인 *밖*이거나 모호한가? → 사용자에게 "이게 점프 같은데" 사전 확인
5. 작업 완료 후 본 파일 *작업 로그 + 진행 상태*를 갱신

---

## 📅 다음 1~2주 액션 (2026-05-22 ~ 2026-06-04)

코드 보강은 *충분히 깊이* 진행됨. 이제 **앱 내 측정 데이터 활성화 + 효과 보기**.

### 🔴 즉시 (이번 주 안) — EAS Build + 스토어 제출 필수

**왜 지금**:
- 어제 추가한 `@react-native-firebase/analytics` (앱 내 화면·이벤트 측정 네이티브 모듈) 가 *운영 앱에 없음*
- 빌드 안 하면 *welcome_screen_shown·signup_complete·screen_view 모두 0건* → 1주 후 단계 2·3 효과 측정 *무력화*
- 빌드 미룬 원래 의도(더 큰 native 변경 모으기)는 *오늘 작업이 다 OTA*라 해소됨

**작업** (개발자 또는 씬짜오 운영진):
- `cd c:/chao-vn-app/chao-vn-app && eas build --platform all --profile production`
- 빌드 완료 후 `eas submit --platform ios` + `eas submit --platform android`
- 스토어 심사 — iOS ~1주, Android ~1~2일
- 빌드/심사 후 PROGRESS_BUILD_PENDING.md 의 analytics 항목 ✅ 처리

### 매일 (5분, 사용자 직접)
- **이메일 발송 확인** — 매일 베트남 시간 6am 자동 발송. `daily-news-final/.tmp/kakao-out/YYYY-MM-DD.txt` 또는 admin/published-news 페이지에서 발송 결과 확인
- **카톡방 게시** — 위 txt 파일 내용을 카톡 오픈채팅 3개(당근/구인구직/부동산)에 복사·붙여넣기

### 빌드 심사 통과 후 (1~2주 후) — 측정 데이터 정착 시점
- **Firebase Console → Analytics → Events** — `welcome_screen_shown`, `signup_complete`, `screen_view` 이벤트 흐름 확인
- **GA4 캠페인 보고서**: 이메일 → 앱 다운로드 페이지 클릭 (utm 추적)
- **3개 핵심 KPI 측정**:
  1. 이메일 클릭률 (6,073명 중 몇 명이 앱 페이지 도달)
  2. 앱 가입 전환률 (welcome_screen_shown 대비 signup_complete)
  3. 가입 후 retention (환영 화면 → 메인 진입 비율)

이 3개 데이터를 보면 *진짜 약점*이 보임 → 메인 라인 다음 보강 방향 결정.

### 2주 후 (별도 트랙 검토)
- [marketing/MEDIA_KIT_v1.md](../../chao-vn-app/chao-vn-app/marketing/MEDIA_KIT_v1.md) 🔴 TODO 8건 채우기 → Canva 디자인 변환 → 영업 시작
- [marketing/STORE_QR_STICKER_GUIDE_v1.md](../../chao-vn-app/chao-vn-app/marketing/STORE_QR_STICKER_GUIDE_v1.md) 협력 매장 1~2곳 시범 시작
- 추천 프로그램 — 광고주 협력 매장이 *3곳 이상* 모이면 v2 재설계 (디스크에 v1 초안 유지)
