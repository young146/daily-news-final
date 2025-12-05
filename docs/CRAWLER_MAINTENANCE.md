# 크롤러 유지보수 가이드

이 문서는 XinChao Vietnam 뉴스 크롤러의 유지보수 방법을 설명합니다.

## 크롤러 구조 개요

```
scripts/
├── crawler.js          # 메인 크롤러 (모든 소스 실행)
└── crawlers/
    ├── vnexpress.js    # VnExpress 영문
    ├── vnexpress_vn.js # VnExpress 베트남어
    ├── yonhap.js       # 연합뉴스
    ├── insidevina.js   # InsideVina
    ├── tuoitre.js      # Tuoi Tre News
    ├── thanhnien.js    # Thanh Nien
    └── vnanet.js       # VNA Net
```

## 일반적인 에러 유형 및 해결 방법

### 1. SSL 인증서 오류

**증상:**
```
ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED
```

**원인:** 오래된 서버의 SSL 설정이 최신 Node.js와 호환되지 않음

**해결 방법:**
```javascript
// 파일 상단에 추가
const https = require('https');
const crypto = require('crypto');

const legacyAgent = new https.Agent({
    rejectUnauthorized: false,
    secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
});

// axios 요청에 추가
const { data } = await axios.get(url, {
    httpsAgent: legacyAgent,
    headers: { ... }
});
```

**참고:** `vnanet.js`에 이미 적용되어 있음

---

### 2. 셀렉터 오류 (Selector not found)

**증상:**
```
No content found for https://...
```
또는 크롤링된 항목이 0개

**원인:** 웹사이트 HTML 구조가 변경됨

**해결 방법:**

1. **브라우저 개발자 도구로 새 셀렉터 확인:**
   - 해당 웹사이트 방문
   - F12 → Elements 탭
   - 기사 제목/내용 요소 우클릭 → Copy → Copy selector

2. **크롤러 파일에서 셀렉터 수정:**

각 크롤러별 주요 셀렉터 위치:

| 크롤러 | 파일 | 목록 셀렉터 (라인) | 내용 셀렉터 (라인) |
|--------|------|-------------------|-------------------|
| VnExpress | vnexpress.js | `.item-news` (19) | `.fck_detail` (60) |
| Yonhap | yonhap.js | `.list-type212 li` (20) | `.article-txt` (57) |
| InsideVina | insidevina.js | `a[href*="articleView.html"]` (16) | `#article-view-content-div` (66) |
| TuoiTre | tuoitre.js | `h3 a, h2 a` (16) | `#main-detail-body` (57) |
| ThanhNien | thanhnien.js | `.story` (16) | `.detail-content` (76) |
| VNA | vnanet.js | `a[href*=".html"]` (25) | `.sample-grl` (76) |

---

### 3. 타임아웃 오류

**증상:**
```
ETIMEDOUT
ECONNRESET
```

**원인:** 네트워크 느림 또는 서버 다운

**해결 방법:**
```javascript
// axios 요청에 타임아웃 추가
const { data } = await axios.get(url, {
    timeout: 30000, // 30초
    headers: { ... }
});
```

---

### 4. 403 Forbidden / 차단

**증상:**
```
Request failed with status code 403
```

**원인:** User-Agent 차단 또는 IP 차단

**해결 방법:**

1. **User-Agent 변경:**
```javascript
headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
```

2. **추가 헤더 설정:**
```javascript
headers: {
    'User-Agent': '...',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://google.com'
}
```

---

### 5. 이미지 URL 문제

**증상:** 이미지가 표시되지 않음

**원인:** 상대 URL 또는 잘못된 이미지 경로

**해결 방법:**
```javascript
// OG 이미지 우선 사용 (가장 신뢰성 높음)
const metaImage = $detail('meta[property="og:image"]').attr('content');
if (metaImage) {
    item.imageUrl = metaImage.startsWith('http') 
        ? metaImage 
        : `https://example.com${metaImage}`;
}
```

---

## 크롤러별 상세 정보

### VnExpress (영문)
- **URL:** https://e.vnexpress.net/
- **특징:** 안정적, 영문 기사
- **주의:** `.item-news`, `.item-topstory` 셀렉터

### Yonhap (연합뉴스)
- **URL:** https://www.yna.co.kr/international/asia-australia
- **특징:** 한국어 기사, 이미지 SSL 문제 있음
- **주의:** 이미지는 Replit 서버에서 다운로드 후 WordPress 업로드 필요

### InsideVina
- **URL:** http://www.insidevina.com/ (HTTP, HTTPS 아님)
- **특징:** 한국 비즈니스 뉴스
- **주의:** HTTP 프로토콜 사용

### TuoiTre
- **URL:** https://tuoitrenews.vn/
- **특징:** 영문 베트남 뉴스
- **주의:** 다양한 셀렉터 시도 필요

### ThanhNien
- **URL:** https://thanhnien.vn/
- **특징:** 베트남어 뉴스
- **주의:** 폴백 셀렉터 로직 있음

### VNA Net
- **URL:** https://vnanet.vn/en/
- **특징:** 포토 갤러리 형식
- **주의:** SSL 레거시 설정 필수, 캡션에서 내용 추출

---

## 셀렉터 수정 예시

### 시나리오: VnExpress 기사 내용이 안 가져와짐

1. **문제 확인:**
   ```
   에러: No content found for https://e.vnexpress.net/...
   ```

2. **브라우저에서 확인:**
   - https://e.vnexpress.net/ 방문
   - 기사 클릭
   - F12 → 기사 내용 영역 우클릭 → Copy selector

3. **새 셀렉터 발견:**
   ```
   .article-content
   ```

4. **vnexpress.js 수정:**
   ```javascript
   // 기존 (60행)
   let content = $detail('.fck_detail').html();
   
   // 수정
   let content = $detail('.article-content').html() || $detail('.fck_detail').html();
   ```

5. **테스트:**
   ```bash
   node -e "require('./scripts/crawlers/vnexpress')().then(items => console.log(items.length, 'items'))"
   ```

---

## 외부 AI 도구 활용법

크롤러 수정이 어려울 때 Claude 또는 ChatGPT에 다음 정보를 제공하세요:

1. **에러 메시지 전체**
2. **해당 크롤러 파일 코드**
3. **대상 웹사이트 URL**
4. **(선택) 웹사이트 HTML 일부**

### 예시 프롬프트:
```
VnExpress 크롤러가 기사 내용을 가져오지 못합니다.

에러:
No content found for https://e.vnexpress.net/news/...

현재 코드 (vnexpress.js):
[코드 붙여넣기]

대상 URL: https://e.vnexpress.net/

기사 내용 영역의 올바른 CSS 셀렉터를 찾아주세요.
```

---

## 자동 재시도 로직

현재 크롤러는 개별 기사 실패 시 요약으로 대체합니다:

```javascript
} catch (err) {
    console.error(`Failed to fetch details for ${item.originalUrl}:`, err.message);
    item.content = item.summary; // 실패 시 요약 사용
    detailedItems.push(item);
}
```

전체 소스 실패 시에도 다른 소스는 계속 진행됩니다 (Promise.allSettled 사용).

---

## 로그 확인 방법

### 관리자 페이지
`/admin/settings` → 크롤러 실행 로그 섹션

### 터미널
```bash
# 전체 크롤링 실행 및 로그 확인
node scripts/crawler.js

# 특정 소스만 테스트
node -e "require('./scripts/crawlers/vnexpress')().then(i => console.log(i))"
```

---

## 문의

크롤러 문제가 지속되면 에러 로그와 함께 AI 도구를 활용하거나, 해당 뉴스 소스의 웹사이트 변경사항을 확인하세요.
