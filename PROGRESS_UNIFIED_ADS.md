# PROGRESS_UNIFIED_ADS.md — 통합 자체 광고 관리 시스템

> **목적**: 앱 + vnkorlife.com + chaovietnam.co.kr **3개 지면의 자체 광고를 한 곳에서** 등록·노출·집계한다.
> **왜(밥줄)**: 자체 광고 판매가 최종 수익원. "앱+웹 묶어 한 계약" 판매를 하려면 광고주별로 3지면 노출을 한눈에 집계해 단가 협상 근거를 만들어야 한다. 실패 불가 과제.
> **최종 갱신**: 2026-08-03 (Phase 1 착수)

---

## ▶ 다음 세션(2026-08-05) 이어서 할 일 — 여기부터 읽기

**오늘(08-03~04)까지 완료:** 통합 광고센터 구축 + 3지면(앱·vnkorlife·chaovietnam) 전부 라이브 연결.
앱 OTA 발송(rv 2.4.3), vnkorlife 배포, chaovietnam 공개 API + WP 플러그인(v3.2.0: 본문 자동삽입 + 사이드바 전체 쌓기 + 재고조회) 완성. 담당자용 [ADS_MANUAL.md](ADS_MANUAL.md) 작성. 사이드바/본문 실물 노출 확인됨.

**내일 할 일 (우선순위 순):**
1. **(사장님) WP 플러그인 v3.2.0 재업로드** — chaovietnam `wp-content/plugins/xinchao-unified-ads.php` 덮어쓰기. (사이드바 전체 쌓기 반영본)
2. **(담당자) 기존 광고 이관 시작** — [ADS_MANUAL.md](ADS_MANUAL.md) 2부대로. chaovietnam 사이드바·본문 광고를 통합센터로. ⚠️ **앱 19건은 손대지 말 것**(중복).
3. **(개발) Phase 4 — 노출·클릭 집계(`ad_events`) + 광고주별 리포트.** 미디어킷 "측정 가능한 광고" 실현. 아직 미착수. 스키마는 아래 정의돼 있음.
4. **(개발, 나중) 앱 19건 이관** — app_ads→ads_unified 복사 → 앱 OTA를 ads_unified '만' 읽게 변경 → app_ads 정리. (중복/공백 방지 순서, [AD_INVENTORY.md](AD_INVENTORY.md) 참고)
5. **(선택) ADS_MANUAL 웹/인쇄판(Artifact)** — 사장님 요청 시.

**미해결/주의:** 앱 이관은 신중히(중복). WP 재업로드 전엔 사이드바가 1개만 뜸(v3.2.0에서 전체 쌓기).

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

  // 노출 지면 + 지면별 위치 + 지면별 노출 페이지
  surfaces: string[],       // ["app","vnkorlife","chaovietnam"] 중 부분집합
  placements: {
    app?:         { position: "head"|"inner"|"bottom"|"popup", targetPages: string[] },
    vnkorlife?:   { position: "top"|"in-content"|"bottom"|"sidebar", targetPages: string[] },
    chaovietnam?: { slot: "default", targetPages: string[] }   // 위치는 Ad Inserter가 담당
  },
  // targetPages 값:
  //   app  = home|danggn|danggn-detail|realestate|realestate-detail|jobs|jobs-detail|magazine|magazine-detail|neighbor
  //   web(vnkorlife·chaovietnam 공통) = home | news-terminal | detail
  //   빈 배열 = 그 지면의 '모든 페이지'에 노출
  //   ⚠️ Phase 2·3 읽기 규칙(웹): 실제 페이지를 3분류로 매핑 —
  //      컨텐츠 상세·뉴스 상세 → "detail" / 뉴스 터미날(허브) → "news-terminal" /
  //      그 외 지정 안 된 페이지(목록·메인 등) → "home"

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
- [x] **Firestore 규칙** ✅ 배포됨 (2026-08-03): `ads_unified`(read:true/write:true, app_ads 패턴), `ad_events`(create:true/read:isAdmin). chao-vn-app/firestore.rules. **이게 없으면 콘솔 저장이 권한거부로 실패했음.** 자체검증: 테스트문서 write→read(vnkorlife 쿼리)→delete 성공.
- [~] **Phase 2a — vnkorlife 읽기 전환** ✅ 코드+빌드 완료: `vnkorlife-web/src/components/detail/AdBanner.tsx` 가 기존 `ads` 에 더해 `ads_unified`(surfaces array-contains vnkorlife) 를 병합해 읽음. 인덱스 불필요(단일 array-contains + 클라 필터). 웹 페이지 버킷 매핑(’*-detail’→detail, 그 외→home) 적용. 위치 ‘in-content’ 는 in-content-N 슬롯 커버. 프로덕션 빌드 통과. → Vercel 배포 후 실광고로 최종 확인.
- [ ] **Phase 2b — 앱 읽기 전환**: 앱 FirebaseAdService 가 `ads_unified`(surface=app) 읽기. 앱은 OTA. 구버전 앱 보호: app_ads 미러링/병행.
- [~] **Phase 3 — 워드프레스 연결** ✅ 코드 완료(사장님 FTP·설치 대기):
  - `app/api/public/ads/route.js` 공개 API ✅ 배포·실호출 검증(테스트광고 JSON 반환 확인).
  - `wordpress-plugin/xinchao-unified-ads.php` (v2.0.0) — **기사 본문 자동 삽입**(the_content, 매 2단락+끝, 우선순위 위→아래) + `[xinchao_ad]` 숏코드(사이드바 등 특정위치). **Advanced Ads/Ad Inserter 불필요** — 직원은 통합센터 등록만. php -l 통과.
  - 사이드바 텍스트 위젯 테스트 성공(실물 확인). 본문 자동삽입은 v2 재업로드 후 동작.
  - **남은 것(사장님)**: v2 .php 를 chaovietnam `wp-content/plugins/` 에 덮어쓰기 → 본문 광고 자동 노출. (사이드바는 텍스트 위젯 [xinchao_ad] 이미 됨)
- [ ] **Phase 4 — 집계·리포트**: 3지면 노출/클릭 이벤트 → `ad_events` → 광고주별·기간별 리포트. 미디어킷 "측정 가능한 광고" 약속 실현.

---

## ⚠️ 리스크 / 반드시 지킬 것
1. **기존 app_ads / ads / 앱은 무손상.** 통합은 새 경로로만.
2. **앱 배포는 OTA(순수 JS).** 구버전 앱 위해 app_ads 미러링 유지(Phase 2).
3. **워드프레스 조각은 사장님 수동 FTP.** 코드·위치 안내 제공.
4. 단계마다 사용자 확인 후 다음 진행.

---

## 🖼️ vnkorlife 광고 슬롯 배치 (2026-08-03 기준)

| 페이지 | 상단(top) | 본문내(in-content) | 하단(bottom) | 사이드바 |
|---|---|---|---|---|
| 홈(통합검색) | ✅ 신설 | — | ✅ 신설 | — |
| 당근/구인/부동산 **목록** | ✅ | ✅ **상품 4개마다** | ✅ | — |
| 위 3종 **상세** | ✅ | ✅ | ✅ | ✅ |
| 옐로페이지·이웃업소 | — (요청따라 제외) | — | — | — |

- 웹 페이지 버킷 매핑: 목록·홈 = `home` 버킷 / 상세 = `detail` 버킷. → 통합센터에서 "홈페이지" 선택 = 홈+목록 노출, "상세페이지" = 상세 노출.
- 이너 슬롯은 전부 `position: "in-content"` (통합센터 vnkorlife "본문 내 배너"와 매칭).

## 📝 작업 로그
- **2026-08-03**: 설계 확정 + 이 문서 작성. 3지면 동일 Firebase(chaovietnam-login) 확인. Phase 1 착수.
- **2026-08-03**: 규칙(firestore+storage) 배포. Phase 2a vnkorlife 라이브(실물 테스트로 storage 규칙 누락 발견·수정). 앱(2b) 코드 준비.
- **2026-08-03**: vnkorlife 광고 슬롯 확충 — 홈 상단/하단 신설, 목록(당근·구인·부동산) 4개마다 in-content 슬롯. 빌드 통과·배포.
