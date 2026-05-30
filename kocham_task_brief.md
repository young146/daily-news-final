# 코참 이메일 스크래퍼 작업 브리프

## 목적
베트남 진출 한국기업 연합회(코참) 회원사 이메일을 수집해서 CSV로 저장.
수집한 이메일은 SendGrid로 베트남 뉴스레터 발송에 활용.

## 타겟 사이트
- 신규 회원사 소개 페이지: https://kochamvietnam.com/board/event/membership/list
- 상세 페이지 URL 패턴: https://kochamvietnam.com/board/event/membership/view?seq={번호}
- 현재 최신 seq: 533 / 총 355개 게시물

## 상세 페이지 데이터 구조 (예시 seq=533)
```
업종/업태 : Investment in environment
Add : Tầng 19, tòa nhà Charmvit, số 117 Trần Duy Hưng...
Tel: 0916 447 551
Email: bvthanhphong@gmail.com
임직원 LEE CHUNG
Email : cchungle01@gmail.com
```
→ 회사 이메일 + 임직원 이메일 둘 다 존재

## 현재 완성된 스크립트 (kocham_scraper.py)
- requests + BeautifulSoup 사용
- seq 533 → 1 역순으로 순회
- UTF-8 강제 디코딩 (사이트가 ISO-8859-1 반환)
- 이메일 정규식 추출, kocham/anpsoft 관리자 이메일 제외
- 0.8초 간격으로 요청 (서버 부하 방지)
- 결과를 kocham_emails.csv로 저장 (utf-8-sig, Excel 호환)

## CSV 출력 컬럼
seq | company | industry | address | tel | emails | url

## 할 일 / 개선 요청사항
- [ ] 스크립트 실행 테스트 및 디버깅
- [ ] 이메일 추출이 잘 안 될 경우 HTML 구조 재확인
- [ ] 수집 완료 후 중복 이메일 제거 로직 보완
- [ ] (선택) SendGrid 연동 - CSV → SendGrid 리스트 자동 업로드

## 실행 방법
```bash
pip install requests beautifulsoup4
python kocham_scraper.py
```
