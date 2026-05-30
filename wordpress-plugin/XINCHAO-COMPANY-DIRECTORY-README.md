# Xinchao Company Directory — WP 플러그인 배포 가이드

베트남 진출 한국기업 디렉토리를 chaovietnam.co.kr에 추가하는 WordPress 플러그인입니다.

---

## 📦 포함 파일

| 파일 | 위치 | 용도 |
|---|---|---|
| `xinchao-company-directory.php` | `wordpress-plugin/` | WP 플러그인 본체 |
| `wp_companies_import.csv` | 프로젝트 루트 | DB에 import할 회사 데이터 (2,662개, 이메일 제외) |
| `company_directory_preview.html` | 프로젝트 루트 | 배포 전 UI 미리보기 (브라우저로 확인용) |
| `company_directory_preview_data.json` | 프로젝트 루트 | preview용 JSON 데이터 |
| `kocham_to_wp_companies.py` | 프로젝트 루트 | (재실행용) 원본 CSV → WP import CSV 변환 스크립트 |

---

## 🖼️ 1단계: 배포 전 미리보기 (선택)

플러그인을 실제로 설치하기 전에, 어떻게 보일지 로컬에서 확인할 수 있습니다.

```bash
# 프로젝트 루트에서
cd c:\xinchao-news-final\daily-news-final
python -m http.server 8765
```

그 다음 브라우저에서 [http://127.0.0.1:8765/company_directory_preview.html](http://127.0.0.1:8765/company_directory_preview.html) 열기.

검색·지역 필터·업종 필터·페이지네이션 모두 실제 동작과 동일하게 작동합니다 (단, 데이터를 메모리에서 필터링하는 점만 다름. 실제 플러그인은 DB 쿼리).

---

## 🚀 2단계: WordPress에 플러그인 설치

### 방법 A — WP 관리자에서 zip 업로드 (추천, 가장 간단)

1. `wordpress-plugin/xinchao-company-directory.php` 파일을 zip으로 압축 (예: `xinchao-company-directory.zip`)
2. WP 관리자 → **플러그인 → 새로 추가 → 플러그인 업로드** 클릭
3. zip 파일 선택 → 설치 → **활성화**
4. 활성화 시점에 DB 테이블 `wp_xinchao_companies` 가 자동 생성됨

### 방법 B — FTP/SSH로 직접 업로드

1. 서버의 `/wp-content/plugins/` 폴더에 `xinchao-company-directory.php` 단일 파일 업로드
2. WP 관리자 → 플러그인 목록에서 "Xinchao Company Directory" → **활성화**

---

## 📊 3단계: 회사 데이터 CSV 업로드

1. WP 관리자 사이드바에서 **기업 디렉토리** 메뉴 클릭 (위치: 대시보드 30번 슬롯, 빌딩 아이콘)
2. **CSV 파일** 선택 → `wp_companies_import.csv` 업로드
3. "**업로드 전 테이블 비우기**" 옵션
   - **첫 업로드**: 체크 안 함 (어차피 비어있음)
   - **재업로드/교체**: 체크해서 깨끗이 새로 시작
4. **업로드 및 가져오기** 버튼
5. 완료 메시지 확인 — `완료 — 추가: 2662, 중복/제외: 0` 정도 나오면 성공

업로드 시간은 약 5~30초 (서버 사양에 따라). PHP 메모리/시간 한도 충분합니다 (배치 INSERT 200건씩).

---

## 🔌 4단계: 페이지에 shortcode 삽입

새 페이지 (예: `/companies` 또는 `/기업디렉토리`)를 만들고 본문에:

```
[company_directory]
```

옵션:

```
[company_directory per_page="30"]                  // 페이지당 표시 개수
[company_directory default_area="HCMC"]            // 기본 선택 지역
[company_directory default_group="IT·미디어·교육"]   // 기본 선택 업종
```

페이지 발행 후 사이트에서 확인.

---

## 🎨 화면 구성 (디자인)

- 상단: 제목 + "총 N개 기업" 카운터
- 필터 바: 검색창 + 지역 드롭다운 + 업종 드롭다운 + 초기화 버튼
- 카드 그리드: 회사명·대표자·업종·주소·전화·홈페이지 (이메일 없음)
- 하단: 페이지네이션 (이전/숫자/다음)
- 색상 테마: 메인 컬러 주황색 (`#ea580c`) — 기존 사이트와 어울리는 톤
- 모바일 반응형 (600px 이하에서 1열로 변경)

스타일은 인라인 CSS로 자동 출력 (테마와 충돌 적음).

---

## 🛠️ 데이터 갱신 (향후)

코참 사이트 회원사가 늘어나면 다시 모아서 교체:

```bash
# 1. 코참 재스크래핑 (한노이/호치민)
python kocham_scraper.py
python kocham_hcm_scraper.py

# 2. 통합 + dedup
python kocham_merge_dedup.py

# 3. WP import용 CSV 재생성
python kocham_to_wp_companies.py

# 4. WP 관리자 → 기업 디렉토리 → "테이블 비우기" 체크 → 새 CSV 업로드
```

---

## 🔒 보안·개인정보 정책

- **이메일 일체 저장 안 함** — `wp_companies_import.csv`에 이메일 컬럼 자체 없음 (`kocham_to_wp_companies.py`가 제거)
- 이메일은 별도 `kocham_all_emails.csv` (SendGrid 발송 전용)로만 활용
- 회사 정보는 코참 공개 페이지에서 수집한 공식 회원사 디렉토리 — 공개해도 무방한 수준

---

## 🐛 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 활성화 후 메뉴가 안 보임 | 권한 부족 | `manage_options` 권한 (관리자) 계정으로 로그인 |
| CSV 업로드 시 "헤더를 읽을 수 없음" | 파일 인코딩 깨짐 | UTF-8 (BOM 가능) 형식인지 확인. `wp_companies_import.csv`는 utf-8-sig로 저장됨 |
| 디렉토리 페이지가 빈 화면 | 데이터 미import | 어드민 페이지에서 "총 등록 회사" 0이면 CSV 업로드부터 |
| 검색·필터가 동작 안 함 | AJAX URL 문제 | 브라우저 개발자도구 → Network 탭에서 `admin-ajax.php` 응답 확인 |
| 깨진 한글 표시 | 테이블 charset 문제 | DB가 utf8mb4 인지 확인. 활성화 시점에 `$wpdb->get_charset_collate()` 사용해 자동 처리됨 |

---

## ⚙️ 기술 스택

- **DB 테이블**: `wp_xinchao_companies` (InnoDB, utf8mb4)
- **검색**: `LIKE %query%` on `search_text` 컬럼 (정규화된 소문자 텍스트)
- **AJAX**: WP 표준 `admin-ajax.php` (action: `xcd_search`)
- **페이지네이션**: LIMIT/OFFSET
- **인덱스**: area, industry_group, company prefix(100)
- **권한**: 어드민 페이지 = `manage_options`, 검색 AJAX = 비로그인 가능 (공개)

---

## 🗑️ 제거 시

WP 플러그인 페이지에서 비활성화 + 삭제. 단, **데이터 테이블은 유지**됩니다 (실수로 데이터 잃지 않도록).

완전 삭제하려면 phpMyAdmin 등에서:
```sql
DROP TABLE wp_xinchao_companies;
```
