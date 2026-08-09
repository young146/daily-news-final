# 광고 재고 & 이관 체크리스트 (통합센터로 이관용)

> 목적: 여러 곳에 흩어진 기존 광고를 **통합 광고센터(ads_unified)로 이관**하기 위한 전수 목록.
> 이관 완료한 광고는 `[x]` 체크. 최종 갱신: 2026-08-04

관련: [PROGRESS_UNIFIED_ADS.md](PROGRESS_UNIFIED_ADS.md)

---

## 📱 앱 광고 (Firestore `app_ads`) — 19건 ✅ 이관 완료 (2026-08-09)

> ✅ **이관 완료**: 19건 전부 ads_unified(surfaces=app)로 복사(_appAdsId 표식). 앱은 OTA로 ads_unified만 읽도록 전환됨(rv 2.4.3). 노출/클릭 집계도 ads_unified로. 옛 「앱 광고 관리」 메뉴 숨김.
> 🔸 app_ads 원본 데이터는 **구버전 앱 호환 위해 당분간 보존**. 추후 OTA 보급 확인 후 정리.
> (아래 목록은 이관 이력용 보존)

활성(🟢):
- [ ] 진원비나 (inner)
- [ ] TN 테크닉스 건설 (TNTC) (inner)
- [ ] EmoiTech (inner)
- [ ] 씬짜오베트남 자체 홍보 (head)
- [ ] 송월타올 (inner)
- [ ] 신한은행베트남 (head)
- [ ] SOMEC (inner)
- [ ] 김안과병원 (inner)
- [ ] 성우인쇄 (inner)
- [ ] 코웨이비나 (inner)
- [ ] 신화건설 (inner)
- [ ] 케이워터(K-Water) (bottom)
- [ ] 대열보일러 (inner)
- [ ] TAPL-타플로지스틱스 (head)
- [ ] 한세실업 (inner)
- [ ] 서울아쿠아 (bottom)
- [ ] KIZUNA(키즈나) (inner)

만료(⚪, 이관 불필요할 수 있음): 대신국제물류 · 부산진해경제자유구역(BJFEZ) · 씬짜오홍보(중복)

## 🌐 vnkorlife 광고 (Firestore `ads`) — 1건
- [ ] (만료된 테스트 1건 "씬자오 데스트"뿐 — 사실상 없음. 신규로 채우면 됨)

## 📰 chaovietnam 광고 (워드프레스 — 여러 곳에 분산) — **미확인, 조사 필요**
Firestore 밖(워드프레스 내부)이라 자동조회 불가. 아래 4곳을 확인해야 함:
- [ ] **모양 → 위젯 → 사이드바**: 이미지 위젯 / Sahifa Ads 위젯 (신한은행·Vietjet·CIS·광고문의 등)
- [ ] **Advanced Ads → 모든 광고**: 플러그인 자체 광고 (여수세계섬박람회 등)
- [ ] **뉴스터미널/기사 본문**: Advanced Ads·Ad Inserter 자동삽입 광고
- [ ] **Sahifa 테마 옵션**: 헤더 등 테마 광고칸
> → 플러그인에 "재고 조회" 기능 추가 예정(URL 하나로 전체 목록 확인).

---

## 🔀 이관 전략 (중복·공백 없이)

### 앱 (app_ads → ads_unified)
그냥 복사 금지(중복). 안전 순서:
1. app_ads 를 ads_unified(surface=app)로 **복사**.
2. 앱 OTA: FirebaseAdService 를 **ads_unified 만 읽도록** 변경(app_ads 병행 제거).
   → 업데이트된 앱=ads_unified만, 구버전 앱=app_ads만 → **어느 쪽도 중복/공백 없음.**
3. OTA 보급 후(수 주) app_ads 비우기.

### vnkorlife
비어있으니 이관 없음. 통합센터에서 신규 등록하면 끝.

### chaovietnam
위 4곳 재고 확인 → 통합센터에 위치(상단/중간/하단/사이드바) 맞춰 재등록 →
워드프레스 위젯/Advanced Ads 에서 기존 것 제거. (이미지는 새로 업로드 필요)

---

## 진행 로그
- 2026-08-04: 앱 19건·vnkorlife 1건 전수조사 완료. chaovietnam WP 조사 도구 추가 예정.
