# 베트남 경제 뉴스 소스 조사

## 현재 상황
- 현재 크롤링 중인 소스들은 주로 종합 뉴스 (VnExpress, TuoiTre, ThanhNien)
- 경제 뉴스가 부족한 상황

## 추천 경제 뉴스 소스 (우선순위별)

### 🥇 Phase 1: 기존 소스의 경제 섹션 타겟팅 (가장 쉬움, 즉시 구현 가능)

#### 1. **VnExpress Kinh Te (경제)** ⭐⭐⭐⭐⭐
- **URL**: https://vnexpress.net/kinh-te
- **장점**: 
  - 이미 VnExpress 크롤러 인프라가 있음
  - 베트남 최대 뉴스 사이트의 경제 섹션
  - 일일 업데이트 빈도 높음
- **구현 난이도**: 매우 쉬움 (기존 vnexpress.js 수정)
- **예상 뉴스량**: 일일 20-30개

#### 2. **VnExpress VN Kinh Te** ⭐⭐⭐⭐⭐
- **URL**: https://vnexpress.vn/kinh-te
- **장점**: 
  - 이미 VnExpress VN 크롤러 있음
  - 베트남어 원문 경제 뉴스
- **구현 난이도**: 매우 쉬움
- **예상 뉴스량**: 일일 20-30개

#### 3. **TuoiTre Kinh Te** ⭐⭐⭐⭐
- **URL**: https://tuoitre.vn/kinh-te.htm (또는 해당 섹션)
- **장점**: 
  - 이미 TuoiTre 크롤러 있음
  - 베트남 주요 일간지
- **구현 난이도**: 쉬움
- **예상 뉴스량**: 일일 15-25개

### 🥈 Phase 2: 전문 경제 뉴스 사이트 (중간 난이도, 높은 품질)

#### 4. **Cafef.vn** ⭐⭐⭐⭐⭐
- **URL**: https://cafef.vn/
- **장점**: 
  - 베트남 최대 경제 전문 뉴스 사이트
  - 주식, 금융, 부동산, 기업 뉴스 전문
  - 고품질 경제 분석 기사
- **구현 난이도**: 중간 (새 크롤러 필요)
- **예상 뉴스량**: 일일 30-50개
- **추천도**: 매우 높음

#### 5. **The Saigon Times** ⭐⭐⭐⭐
- **URL**: https://www.thesaigontimes.vn/
- **장점**: 
  - 사이공 지역 경제 뉴스 전문
  - 영어/베트남어 제공
  - 비즈니스 중심
- **구현 난이도**: 중간
- **예상 뉴스량**: 일일 10-20개

#### 6. **VietNamNet Kinh Te** ⭐⭐⭐⭐
- **URL**: https://vietnamnet.vn/kinh-te
- **장점**: 
  - 베트남 주요 온라인 매체
  - 경제 섹션 활발
- **구현 난이도**: 중간
- **예상 뉴스량**: 일일 15-25개

### 🥉 Phase 3: 공식/기관 소스 (신뢰도 높음, 업데이트 빈도 낮을 수 있음)

#### 7. **VNA (Vietnam News Agency) - Economy** ⭐⭐⭐
- **URL**: https://vietnam.vn/kinh-te (또는 vnanet.vn)
- **장점**: 
  - 베트남 공식 통신사
  - 신뢰도 매우 높음
  - 공식 경제 정책 뉴스
- **구현 난이도**: 중간-높음 (구조 확인 필요)
- **예상 뉴스량**: 일일 5-15개

#### 8. **Invest Vietnam (베트남 투자청)** ⭐⭐⭐
- **URL**: https://investvietnam.gov.vn/
- **장점**: 
  - 공식 투자 정보
  - 경제 정책, 투자 동향
- **구현 난이도**: 높음 (PDF/뉴스레터 형태일 수 있음)
- **예상 뉴스량**: 주간/월간

## 즉시 구현 가능한 옵션 (Phase 1)

### 1. VnExpress Kinh Te 크롤러 추가
- 기존 `scripts/crawlers/vnexpress.js` 수정 또는
- 새로운 `scripts/crawlers/vnexpress-economy.js` 생성
- URL: `https://vnexpress.net/kinh-te`

### 2. VnExpress VN Kinh Te 크롤러 추가
- 기존 `scripts/crawlers/vnexpress-vn.js` 수정 또는
- 새로운 `scripts/crawlers/vnexpress-vn-economy.js` 생성
- URL: `https://vnexpress.vn/kinh-te`

## 추천 구현 순서

1. **즉시**: VnExpress Kinh Te 섹션 크롤링 추가 (1-2시간 작업)
2. **단기**: Cafef.vn 크롤러 추가 (베트남 최대 경제 전문 사이트)
3. **중기**: TuoiTre Kinh Te, VietNamNet Kinh Te 추가

## 예상 효과

- **Phase 1만 구현**: 일일 경제 뉴스 40-60개 추가
- **Phase 1 + Cafef.vn**: 일일 경제 뉴스 70-110개 추가
- **전체 구현**: 일일 경제 뉴스 100-150개 추가

## 다음 단계

1. VnExpress Kinh Te 크롤러 구현 테스트
2. Cafef.vn 사이트 구조 분석 및 크롤러 개발
3. 각 소스별 크롤링 품질 검증

