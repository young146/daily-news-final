"""
코참 베트남 회원사 이메일 스크래퍼
================================
실행 전 설치:
  pip install requests beautifulsoup4

실행:
  python kocham_scraper.py

결과: kocham_emails.csv (Excel에서 바로 열기 가능)
"""

import requests
from bs4 import BeautifulSoup
import csv
import time
import re
import sys

# Windows 콘솔에서 한글/베트남어 출력을 위해 stdout을 UTF-8로 재설정
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_URL = "https://kochamvietnam.com/board/event/membership/view?seq={}"
OUTPUT_FILE = "kocham_emails.csv"

SEQ_START = 1
SEQ_END = 533  # 현재 최신 seq 번호 (나중에 늘어나면 숫자 올리면 됨)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}

# 제외할 이메일 키워드 (관리자/시스템 이메일)
EXCLUDE_KEYWORDS = ['kocham', 'anpsoft', 'example', 'test@', 'noreply']

def extract_emails(text):
    """텍스트에서 이메일 주소 추출"""
    pattern = r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
    found = re.findall(pattern, text)
    # 제외 키워드 필터링 + 중복 제거
    cleaned = list(set([
        e.lower() for e in found
        if not any(kw in e.lower() for kw in EXCLUDE_KEYWORDS)
    ]))
    return cleaned

def scrape_page(seq):
    try:
        url = BASE_URL.format(seq)
        res = requests.get(url, headers=HEADERS, timeout=15)
        
        # UTF-8로 강제 디코딩
        content = res.content.decode('utf-8', errors='replace')
        
        if res.status_code != 200 or len(content) < 500:
            return None

        soup = BeautifulSoup(content, 'html.parser')
        text = soup.get_text(separator='\n')

        # 회사명: og:title 메타 태그에서 추출 (실제 회사명이 여기 들어감)
        og_title = soup.find('meta', attrs={'property': 'og:title'})
        if og_title and og_title.get('content'):
            company_name = og_title['content'].strip()
        else:
            # 폴백: <title> 태그
            title_tag = soup.find('title')
            company_name = title_tag.get_text(strip=True) if title_tag else f"seq_{seq}"
        if not company_name or company_name == '코참베트남 > 제공서비스 > 신규 회원사 소개':
            company_name = f"seq_{seq}"

        # 이메일 추출
        emails = extract_emails(text)
        if not emails:
            return None

        # 전화번호
        tel_match = re.search(r'Tel[:\s]+([\d\s\(\)\-\+\.]+)', text, re.IGNORECASE)
        tel = tel_match.group(1).strip()[:30] if tel_match else ""

        # 업종
        industry_match = re.search(r'업종/업태\s*:\s*(.+?)(?:\n|Add\s*:)', text, re.DOTALL)
        industry = industry_match.group(1).strip()[:80] if industry_match else ""

        # 주소
        addr_match = re.search(r'Add\s*:\s*(.+?)(?:\n|Tel\s*:)', text, re.DOTALL)
        address = addr_match.group(1).strip()[:100] if addr_match else ""

        return {
            'seq': seq,
            'company': company_name,
            'industry': industry,
            'address': address,
            'tel': tel,
            'emails': ', '.join(emails),
            'url': url
        }

    except Exception as e:
        print(f"  오류 seq={seq}: {e}")
        return None

def main():
    results = []
    no_email_count = 0

    print("=" * 60)
    print("  코참 베트남 회원사 이메일 수집 시작")
    print(f"  범위: seq {SEQ_START} ~ {SEQ_END} (총 {SEQ_END - SEQ_START + 1}개)")
    print("=" * 60)

    for seq in range(SEQ_END, SEQ_START - 1, -1):
        result = scrape_page(seq)
        if result:
            results.append(result)
            print(f"  ✓ [{seq:3d}] {result['company'][:35]:<35} | {result['emails'][:50]}")
        else:
            no_email_count += 1
            if seq % 50 == 0:  # 50개마다 진행상황 표시
                print(f"  ... seq {seq} 처리 중 (이메일 없는 페이지 {no_email_count}개)")

        time.sleep(0.8)  # 서버 부하 방지

    # CSV 저장
    print("\n" + "=" * 60)
    if results:
        with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['seq', 'company', 'industry', 'address', 'tel', 'emails', 'url']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)

        print(f"  완료! 이메일 수집: {len(results)}개 기업")
        print(f"  이메일 없음: {no_email_count}개")
        print(f"  저장 파일: {OUTPUT_FILE}")
        print("  → Excel에서 열기: 파일 > 열기 > UTF-8 선택")
    else:
        print("  수집된 데이터 없음")
    print("=" * 60)

if __name__ == "__main__":
    main()
