# 전체 워크플로우 검증 문서

## 1. 뉴스 수집 (Crawling)

### 파일: `scripts/crawlers/*.js`, `app/api/crawl-news/route.js`

**프로세스:**
1. 각 소스에서 뉴스 크롤링
2. 베트남 시간대 기준으로 `publishedAt` 설정 (`getVietnamTime()`)
3. 데이터베이스에 저장 (중복 체크)
4. 번역 상태: `translationStatus = 'PENDING'`

**확인 사항:**
- ✅ 모든 크롤러가 베트남 시간대 사용
- ✅ 중복 체크 로직 작동
- ✅ 번역 실패 시 `PENDING` 상태 유지

---

## 2. 뉴스 번역 (Translation)

### 파일: `app/admin/news/[id]/translate/page.js`, `lib/translator.js`

**프로세스:**
1. 관리자가 뉴스 선택
2. OpenAI API로 번역
3. `translatedTitle`, `translatedContent`, `translatedSummary` 업데이트
4. `translationStatus = 'COMPLETED'`

**확인 사항:**
- ✅ 번역된 내용이 데이터베이스에 저장됨
- ✅ 번역 상태 업데이트됨

---

## 3. 뉴스 발행 (Publishing)

### 파일: `app/admin/actions.js`, `lib/publisher.js`

**프로세스:**
1. 관리자가 "발행" 버튼 클릭
2. `publishToMainSite()` 호출
3. WordPress에 게시
4. 데이터베이스 업데이트:
   - `isPublishedMain = true`
   - `status = 'PUBLISHED'`
   - `wordpressUrl` 저장
   - `publishedAt` 베트남 시간 기준 설정

**확인 사항:**
- ✅ WordPress 게시 성공
- ✅ 데이터베이스 플래그 업데이트
- ✅ `publishedAt` 베트남 시간 기준

---

## 4. 탑뉴스 선택 (Top News Selection)

### 파일: `app/admin/actions.js`

**프로세스:**
1. 관리자가 뉴스 선택
2. "탑뉴스로 지정" 버튼 클릭
3. 데이터베이스 업데이트:
   - `isTopNews = true`
   - `isSelected = true`

**확인 사항:**
- ✅ 탑뉴스 플래그 설정됨
- ✅ Jenny 페이지에서 탑뉴스로 표시됨

---

## 5. 카드 뉴스 발행 (Card News Publishing)

### 파일: `app/api/publish-card-news/route.js`, `lib/publisher.js`

**프로세스:**
1. 관리자가 카드 뉴스 발행 버튼 클릭
2. **탑뉴스 1개 선택**:
   - 선택된 탑뉴스 ID가 있으면 사용
   - 없으면 `isTopNews=true`인 최신 뉴스 사용
   - 없으면 발행된 최신 뉴스 사용
3. **일반 뉴스 4개 선택**:
   - 탑뉴스 제외
   - `isPublishedMain=true`, `status='PUBLISHED'`
   - 오늘 날짜 기준 (`publishedAt >= today`)
   - 최신순 정렬
4. **5개 뉴스에 `isCardNews=true` 플래그 설정**
5. 카드 이미지 생성
6. WordPress News Terminal 페이지 Featured Image 업데이트
7. **전령카드 확인하기 링크 생성**: `https://chaovietnam.co.kr/daily-news-terminal/?v=MMDD`
   - MMDD 형식: 월(2자리) + 일(2자리)
   - 예: 12월 20일 → `?v=1220`

**확인 사항:**
- ✅ 탑뉴스 1개 + 일반 뉴스 4개 = 총 5개 선택됨
- ✅ 선택된 5개에 `isCardNews=true` 설정됨
- ✅ 날짜 파라미터가 링크에 포함됨
- ✅ WordPress Featured Image 업데이트됨

---

## 6. 전령카드 확인하기 (Card News Display)

### 파일: `app/print/card-news/page.js`, WordPress Plugin

**프로세스:**
1. 사용자가 전령카드 확인하기 링크 클릭
2. URL: `https://chaovietnam.co.kr/daily-news-terminal/?v=MMDD`
3. **날짜 파라미터 파싱**:
   - `v` 파라미터에서 월(MM)과 일(DD) 추출
   - 현재 연도와 결합하여 날짜 생성
   - 베트남 시간대 기준
4. **뉴스 조회**:
   - 탑뉴스 1개: `isTopNews=true`, 해당 날짜
   - 카드 뉴스 4개: `isCardNews=true`, 해당 날짜, 탑뉴스 제외
5. 카드 뉴스 표시 (탑뉴스 1개 + 일반 뉴스 4개 = 총 5개)

**확인 사항:**
- ✅ 날짜 파라미터가 올바르게 파싱됨
- ✅ 해당 날짜의 뉴스가 표시됨
- ✅ 탑뉴스 1개 + 일반 뉴스 4개 = 총 5개 표시됨

---

## 전체 워크플로우 체크리스트

### 뉴스 수집
- [x] 크롤러가 베트남 시간대 사용
- [x] 중복 체크 작동
- [x] 번역 상태 관리

### 뉴스 발행
- [x] WordPress 게시 성공
- [x] 데이터베이스 플래그 업데이트
- [x] `publishedAt` 베트남 시간 기준

### 카드 뉴스 발행
- [x] 탑뉴스 1개 선택
- [x] 일반 뉴스 4개 선택
- [x] 총 5개 뉴스에 `isCardNews=true` 설정
- [x] 날짜 파라미터(`?v=MMDD`) 링크에 포함

### 전령카드 확인하기
- [x] 날짜 파라미터 파싱
- [x] 해당 날짜의 뉴스 조회
- [x] 탑뉴스 1개 + 일반 뉴스 4개 = 총 5개 표시

---

## 수정된 파일 목록

1. `app/api/publish-card-news/route.js`
   - 탑뉴스 1개 + 일반 뉴스 4개 선택 로직 추가
   - `isCardNews` 플래그 설정
   - 날짜 파라미터 생성 및 링크에 추가

2. `app/print/card-news/page.js`
   - 날짜 파라미터(`?v=MMDD`) 파싱 로직 추가
   - 해당 날짜의 뉴스 조회

3. `lib/publisher.js`
   - `terminalUrl`에 날짜 파라미터 포함 (이미 `options.terminalUrl` 사용 중)

---

## 테스트 시나리오

### 시나리오 1: 정상 플로우
1. 뉴스 크롤링 → 번역 → 발행
2. 탑뉴스 선택
3. 카드 뉴스 발행
4. 전령카드 확인하기 링크 클릭
5. **예상 결과**: 해당 날짜의 탑뉴스 1개 + 일반 뉴스 4개 = 총 5개 표시

### 시나리오 2: 날짜 파라미터 테스트
1. 카드 뉴스 발행 (예: 12월 20일)
2. 링크: `https://chaovietnam.co.kr/daily-news-terminal/?v=1220`
3. **예상 결과**: 12월 20일의 뉴스 5개 표시

### 시나리오 3: 탑뉴스 없을 때
1. 탑뉴스가 없는 상태에서 카드 뉴스 발행
2. **예상 결과**: 발행된 최신 뉴스 1개를 탑뉴스로 사용, 일반 뉴스 4개 추가

---

## 주의사항

1. **날짜 파라미터 형식**: `?v=MMDD` (월 2자리 + 일 2자리)
   - 예: 12월 5일 → `?v=1205`
   - 예: 1월 20일 → `?v=0120`

2. **베트남 시간대**: 모든 날짜/시간 처리는 베트남 시간대(`Asia/Ho_Chi_Minh`) 기준

3. **뉴스 선택 순서**:
   - 탑뉴스 우선 선택
   - 탑뉴스가 없으면 발행된 최신 뉴스 사용
   - 일반 뉴스는 탑뉴스 제외하고 선택

4. **플래그 관리**:
   - `isCardNews`는 카드 뉴스 발행 시 설정
   - 이전 카드 뉴스 플래그는 자동으로 초기화되지 않음 (필요시 수동 초기화)

