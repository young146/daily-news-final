# HANDOVER.md — 씬짜오 데일리뉴스 홍보카드 작업 현황
_최종 업데이트: 2026-03-08_

---

## ✅ 완료된 작업

### 1. 홍보카드(PromoCard) 관리 시스템

| 항목 | 파일 | 상태 |
|---|---|---|
| DB 스키마 (PromoCard 모델) | `prisma/schema.prisma` | ✅ 완료 |
| API — 전체 조회/생성 | `app/api/promo-cards/route.js` | ✅ 완료 |
| API — 단일 조회/수정/삭제 | `app/api/promo-cards/[id]/route.js` | ✅ 완료 (GET 추가됨) |
| API — 활성 카드만 조회 | `app/api/promo-cards/active/route.js` | ✅ 완료 |
| 관리 페이지 | `app/admin/promo-cards/page.js` | ✅ 완료 |

**관리 페이지 기능:**
- 카드 생성 (이미지 Firebase Storage 업로드, 제목, 설명, 링크, 순서, ON/OFF)
- 카드 목록 그리드 표시 (이미지 썸네일 포함)
- ON/OFF 토글
- 미리보기 모달 (고객에게 보이는 카드 그대로)
- 편집 / 삭제

### 2. 전령카드 발행 후 게시 완료 팝업에 홍보카드 표시

**파일:** `app/admin/card-news/CardNewsSimple.js`

- 게시 완료 팝업에 활성 홍보카드 표시 (이미지 + 제목 + 설명)
- URL 자동 링크화 (linkify 함수)
- 이미지 `objectFit: contain` (잘림 방지)

### 3. 홍보카드 OG 페이지 생성 (배포 완료)

**파일:** `app/promo/[id]/page.js`

- URL: `chaovietnam.co.kr/promo/[id]`
- OG 메타태그 포함 (og:image, og:title, og:description)
- 카카오톡에 URL 공유 시 → 홍보카드 이미지 미리보기 생성
- "자세히 보기" 버튼 → 실제 linkUrl로 이동 (링크 작동)
- **이미 git push 완료 → Vercel 자동 배포 중**

---

## ⚠️ 미완성 / 남은 과제

### 핵심 과제: 뉴스카드 + 홍보카드 통합 자동화

**현재 상황:**
- 뉴스 발행 후 팝업에 홍보카드가 표시되나, 공유 흐름이 2단계 수동 작업
- 카카오톡 URL 미리보기: 뉴스 URL은 이미지 카드로 보임. 홍보카드 URL은 배포 후 이미지 카드로 보일 예정

**요청된 목표:**
- 뉴스카드 이미지 + 홍보카드 이미지를 **하나의 통합 이미지**로 자동 합성
- 이 합성 이미지가 이메일/SNS 발송 시 **자동으로 첨부**
- 링크도 작동해야 함 (이미지 단독으로는 링크 불가 → **PDF 또는 URL 방식 필요**)

**해결 방향 (미구현):**
- 방법A: `/promo/[id]` URL을 SNS 공유용 URL 목록에 자동 포함
- 방법B: 뉴스 발행 API에서 활성 홍보카드를 canvas로 합성 후 이미지 업로드
- 방법C: 이메일 템플릿에 홍보카드 섹션 자동 추가

---

## 📁 주요 파일 목록

```
app/
├── admin/
│   ├── card-news/
│   │   ├── CardNewsSimple.js      ← 전령카드 생성 + 게시 팝업
│   │   └── CardNewsPreviewMars.js ← 캔버스 기반 카드 생성 (html2canvas)
│   └── promo-cards/
│       └── page.js                ← 홍보카드 관리 페이지
├── api/
│   ├── promo-cards/
│   │   ├── route.js               ← GET 전체 / POST 생성
│   │   ├── [id]/route.js          ← GET 단일 / PUT 수정 / DELETE 삭제
│   │   └── active/route.js        ← GET 활성 카드만
│   └── publish-card-news/         ← 전령카드 이미지 생성 + WP 업로드
└── promo/
    └── [id]/page.js               ← 홍보카드 OG 랜딩 페이지 ← 신규
lib/
└── firebase-client.js             ← Firebase Storage 클라이언트 SDK
prisma/
└── schema.prisma                  ← PromoCard 모델 포함
```

---

## 🔑 중요 기술 사항

- **Next.js 15**: `params`는 `await context.params`로 처리해야 함 (sync 접근 불가)
- **이미지 업로드**: Firebase Storage 직접 업로드 (`lib/firebase-client.js`)
- **카카오톡 OG 미리보기**: 서버에서 `og:image` 메타태그 필요 → `/promo/[id]` 방식으로 해결
- **이미지 내 링크**: PNG/JPEG 이미지 파일은 링크 불가 → URL 방식 또는 PDF 필요
- **PowerShell**: `&&` 대신 `;` 사용

---

## 🚀 다음 작업 시 먼저 할 일

1. `localhost:3000/promo/1` (admin **없이**) 접속해서 홍보카드 페이지 확인
2. 카카오톡에서 `chaovietnam.co.kr/promo/1` 공유 시 이미지 카드 미리보기 확인
3. 이후 통합 자동화 방향 결정 (방법A/B/C 중 선택)
