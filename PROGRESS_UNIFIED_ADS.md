# PROGRESS_UNIFIED_ADS.md — 통합 자체 광고 관리 시스템

> **목적**: 앱 + vnkorlife.com + chaovietnam.co.kr **3개 지면의 자체 광고를 한 곳에서** 등록·노출·집계한다.
> **왜(밥줄)**: 자체 광고 판매가 최종 수익원. "앱+웹 묶어 한 계약" 판매를 하려면 광고주별로 3지면 노출을 한눈에 집계해 단가 협상 근거를 만들어야 한다. 실패 불가 과제.
> **최종 갱신**: 2026-08-03 (Phase 1 착수)

---

## 🧭 이어가기 규칙
- 새 세션은 **이 문서 맨 위부터** 읽고 "현재 상태 / 다음 단계"를 본다.
- 코드 수정 후 이 문서의 Phase 상태를 갱신한다.
- 상위 흐름은 `chao-vn-app/WORKLOG.md`, 이 주제의 심화는 여기.

---

## 🔑 결정적 사실 (설계의 전제 — 실물로 확인됨 2026-08-03)

| 지면 | 기술 | Firebase 프로젝트 | 현재 광고 저장소 | 광고 읽는 파일 |
|---|---|---|---|---|
| 앱 | React Native | **chaovietnam-login** | Firestore `app_ads` | `chao-vn-app/services/FirebaseAdService.js` |
| vnkorlife.com | Next.js | **chaovietnam-login** | Firestore `ads` | `vnkorlife-web/src/components/detail/AdBanner.tsx` |
| chaovietnam.co.kr | WordPress(PHP) | — (외부) | WP Ad Inserter 플러그인 | WP (Firestore 직접 못 읽음) |

- **앱·vnkorlife·daily-news 는 전부 같은 Firebase 프로젝트(`chaovietnam-login`)** → 앱·웹은 통합 컬렉션을 **직접** 읽을 수 있음. **API가 꼭 필요한 곳은 워드프레스 하나뿐.**
- 관리 콘솔 = **daily-news-final `/admin`** (이미 가장 완성된 광고 UI 보유, 앱이 여기서 관리됨).

---

## 🏗️ 아키텍처

```
[daily-news /admin/ad-center]  ← 직원이 쓰는 단일 관리처
        │ writes
        ▼
  Firestore  ads_unified   ← 통합 단일 소스 (chaovietnam-login)
        │                         │
   직접 읽기                 공개 API: GET /api/public/ads
   ┌────┴─────┐                    │ (워드프레스용)
   ▼          ▼                    ▼
 [앱]     [vnkorlife]        [chaovietnam WP + Ad Inserter 조각]
   │          │                    │
   └──────────┴──── 노출/클릭 이벤트 ────┴──▶  ad_events (집계) ──▶ 광고주별 리포트
```

**원칙: 기존에 돌아가는 것(app_ads, ads, 앱)은 절대 건드리지 않는다.** 통합은 새 컬렉션 `ads_unified` + 새 페이지로 additive 하게 짓고, 검증되면 구 경로를 은퇴시킨다.

---

## 📐 데이터 스키마

### 컬렉션 `ads_unified` (광고 1건)
```js
{
  // 광고주 (묶어 팔기 리포트의 기준)
  advertiserId:   string,   // slug. 비우면 advertiserName에서 자동 생성
  advertiserName: string,

  // 소재
  title:   string,          // 내부 관리용 캠페인명
  type:    "image" | "video",
  images:  string[],        // Storage URL (경로: ads_unified/...)
  linkUrl: string,

  // 노출 지면 + 지면별 위치
  surfaces: string[],       // ["app","vnkorlife","chaovietnam"] 중 부분집합
  placements: {
    app?:         { position: "head"|"inner"|"bottom"|"popup" },
    vnkorlife?:   { position: "top"|"in-content"|"bottom"|"sidebar" },
    chaovietnam?: { slot: "default" }   // 위치는 Ad Inserter가 담당
  },

  // 일정/상태
  startDate: "YYYY-MM-DD",
  endDate:   "YYYY-MM-DD",
  isActive:  boolean,
  priority:  number,        // 낮을수록 우선

  // 집계 (Phase 4에서 ad_events로 정밀화. 아래 카운터는 빠른 참조용)
  impressions: number,      // 기본 0
  clicks:      number,      // 기본 0

  createdAt, updatedAt      // serverTimestamp
}
```

### 컬렉션 `ad_events` (Phase 4 — 노출/클릭 1건씩)
```js
{ adId, advertiserId, surface, type:"impression"|"click", ts: serverTimestamp() }
```

---

## 🚦 Phase 진행 상태

- [x] **Phase 1 — 통합 관리 콘솔** ✅ 코드 완료 (검증 대기)
  - 신규 파일: `app/admin/ad-center/page.js` (컬렉션 `ads_unified` 쓰기)
  - `app/admin/layout.js` 네비에 「🎯 통합 광고센터」 추가 (기존 「앱 광고 관리」 그대로 둠)
  - 광고주명·캠페인·지면 체크박스(앱/vnkorlife/chaovietnam)·지면별 위치·기간·우선순위·이미지/영상 업로드(Storage `ads_unified/`) 구현
  - ESLint: 새 파일 오류 0. (layout.js의 기존 fetchUser 경고는 기존 코드, 무관)
  - ⚠️ 아직 어느 지면도 `ads_unified`를 안 읽으므로 라이브 무해. 실제 노출은 Phase 2·3 후.
  - 다음: Vercel 배포 후 `/admin/ad-center`에서 테스트 광고 1건 등록 → Firestore `ads_unified` 문서 생김 확인.
- [ ] **Phase 2 — 읽기 전환**: vnkorlife AdBanner + 앱 FirebaseAdService 가 `ads_unified`(surface 필터) 읽기. 앱은 OTA. 구버전 앱 보호: app_ads 미러링.
- [ ] **Phase 3 — 워드프레스 연결**: `GET /api/public/ads` 신설 + chaovietnam Ad Inserter 커스텀 코드 조각(사장님 FTP 업로드).
- [ ] **Phase 4 — 집계·리포트**: 3지면 노출/클릭 이벤트 → `ad_events` → 광고주별·기간별 리포트. 미디어킷 "측정 가능한 광고" 약속 실현.

---

## ⚠️ 리스크 / 반드시 지킬 것
1. **기존 app_ads / ads / 앱은 무손상.** 통합은 새 경로로만.
2. **앱 배포는 OTA(순수 JS).** 구버전 앱 위해 app_ads 미러링 유지(Phase 2).
3. **워드프레스 조각은 사장님 수동 FTP.** 코드·위치 안내 제공.
4. 단계마다 사용자 확인 후 다음 진행.

---

## 📝 작업 로그
- **2026-08-03**: 설계 확정 + 이 문서 작성. 3지면 동일 Firebase(chaovietnam-login) 확인. Phase 1 착수.
