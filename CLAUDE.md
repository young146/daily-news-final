# Agent Instructions — daily-news-final (씬짜오 뉴스 터미널)

> 이 파일은 CLAUDE.md / AGENTS.md / GEMINI.md 로 **동일하게 미러링**된다.
> 어느 AI 환경(Claude / Gemini / GPT 등)에서도 같은 규칙이 로드되도록 하기 위함.
> 새 세션·새 AI는 작업 시작 전 이 파일을 반드시 읽고 내재화한다.
> 이 저장소는 git 으로 **집·사무실 두 PC에 동기화**된다 → 여기 적힌 규칙은 두 곳 모두에 적용된다.

## 이 저장소가 하는 일
- `wordpress-plugin/jenny-daily-news.php` — 워드프레스 사이트(씬짜오 뉴스 터미널)의 표시 플러그인.
  뉴스 카드, 정보바(날씨·환율·주가·금/유가), 커머스 카드(항공권·호텔·여행준비), 제휴 링크 시스템이 전부 이 한 파일에 있다.
- `app/`, `lib/`, `scripts/` — Next.js 백엔드(관리자·크롤링·이메일·푸시 등).

## 🚨 PHP 변경 시 필수: 배포 전 문법검사 (`php -l`)

`*.php` 파일을 수정했으면 **올리기(배포) 전에 반드시 문법검사**를 돌리고 결과를 보고한다. 예외 없음.

```bash
php -l wordpress-plugin/jenny-daily-news.php
# → "No syntax errors detected ..." 가 나와야 통과
```

**왜:** 워드프레스 플러그인은 문법 오류 하나로 사이트 전체가 하얗게 깨진다(White Screen of Death).
`php -l` 은 실행 없이 괄호·따옴표·세미콜론 같은 문법 오류만 미리 잡아주는 안전망이다.

### `php` 명령이 없을 때 (예: 사무실 PC, 새 환경)
한 번만 설치하면 된다 (Windows):
```powershell
winget install --id PHP.PHP.8.3 -e --accept-source-agreements --accept-package-agreements
```
- 설치 후 **새 터미널**부터 `php` 가 PATH에서 잡힌다.
- 설치 직후 같은 셸에서 바로 쓰려면 winget 패키지 폴더의 `php.exe` 를 전체 경로로 호출한다:
  `…\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_*\php.exe -l <파일>`
- 서버는 PHP 8.x 이므로 로컬도 8.3 으로 맞춘다(문법 호환).

> `php -l` 은 **문법** 검사까지다. 실제 동작(워드프레스 함수가 의도대로 도는지)은 업로드 후 페이지를 한 번 열어 확인하는 것이 최종 점검이다. 그래도 가장 흔한 사고(하얀 화면=문법 오류)는 이걸로 거의 다 걸러진다.

## 배포 워크플로우 (플러그인)

플러그인은 **앱(EAS/OTA)과 무관**하다. `eas update` 같은 명령을 절대 쓰지 않는다.

1. **문법검사**: `php -l wordpress-plugin/jenny-daily-news.php` → 통과 확인
2. **판번호 올리기**: 헤더의 `Version:` 을 반드시 올린다. 안 올리면 **서버에 반영됐는지조차 알 수 없다.**
3. **git push**: 변경을 커밋·푸시(코드 백업·양쪽 PC 동기화)
4. **FTP 업로드**: `npm run deploy:plugin -- <파일명>` (2026-09-02 자동화됨)
   ```bash
   npm run deploy:plugin -- xinchao-fx-calculator.php     # 한 개
   npm run deploy:plugin -- --dry                          # 올리기 전 계획만 확인
   npm run deploy:plugin                                   # wordpress-plugin/*.php 전부
   ```
   스크립트가 대신 지켜 주는 것들:
   - **놓을 위치를 서버에 물어본다.** 플러그인마다 배치가 다르다 — `jenny-daily-news/jenny-daily-news.php`,
     `xinchao-image-uploader /xinchao-image-uploader.php`(폴더명 끝에 공백!) 는 하위폴더고,
     `xinchao-fx-calculator.php`·`xinchao-unified-ads.php` 는 `plugins/` 바로 아래다.
     **전부 평면으로 올리면 중복 파일이 생겨 플러그인이 두 개로 보인다.**
   - **서버가 더 최신이면 중단한다.** 낡은 로컬로 덮어써 조용히 되돌리는 사고를 막는다(`--force` 로만 무시).
   - **올린 뒤 REST API 로 버전을 되읽어 확인**한다. 올렸다는 말만 하고 끝내지 않는다.
   - 비밀번호는 명령줄이 아니라 **stdin** 으로 curl 에 넘긴다(프로세스 목록 노출 방지). FTPS 우선.
   - ⚠️ `.env` 의 `FTP_PASS` 가 필요하다. 없으면 스크립트가 안내하고 멈춘다.

   손으로 올릴 때의 주의(FileZilla 등):
   - 방향 주의: **로컬(왼쪽) → 서버(오른쪽)**. 반대로 하면 로컬이 옛 서버 파일로 덮여 작업이 날아간다.
   - 만약 로컬이 손상되면 git 에 모든 변경이 있으니 `git restore <파일>` 로 복구 가능.

### 워드프레스에서 AI 가 할 수 있는 것 / 없는 것 (2026-09-02 실측)

앱 비밀번호(`WORDPRESS_APP_PASSWORD`)로 REST API 를 쓰면 **관리자 권한**이다.

| 되는 것 | 안 되는 것 |
|---|---|
| 페이지·글 생성/수정/삭제 · 미디어 업로드 | **커스텀 .php 를 서버에 놓기** |
| 카테고리·메뉴·사이트 설정 · 사용자 | ↳ 미디어 `.php` 업로드는 **403** 차단 |
| 플러그인 활성화/비활성화 | ↳ 플러그인 설치 API 는 **wordpress.org 저장소 한정** |
| wordpress.org 플러그인 설치 | → 그래서 **이 한 단계만 FTP** 가 필요하다 |

⇒ 페이지 만들고 숏코드 넣는 일까지 **AI 가 직접 한다.** 사람에게 넘기지 말 것.

## 제휴(affiliate) 시스템 메모

- 모든 제휴는 `jenny_affiliate_destinations()` 배열의 `'slug' => 'URL'` 한 줄로 관리된다.
- 버튼은 `우리도메인/go/{slug}` 를 거쳐 **클릭을 집계**한 뒤 실제 제휴 URL로 302 리다이렉트된다(`jenny_handle_go_redirect`).
- 목적지가 빈 문자열(`''`)이면 그 버튼은 **화면에 아예 안 나온다** → 링크 발급 전 깨진 버튼 방지. URL 한 줄 넣으면 자동 노출.
- 현재 제휴: Wise(송금), Trip.com(항공·OTA), Booking·Agoda(호텔), Airalo(eSIM), Klook(투어), Aviasales(메타서치·보존).

## 보고 형식
버그 수정·동작 변경 시: **원인(왜 그렇게 동작했는지 메커니즘) → 수정(무엇을 바꿨고 어떻게 바뀌는지)** 순으로, 비전문가도 이해되게 설명한다. 단순 텍스트·색상 변경엔 생략 가능.
