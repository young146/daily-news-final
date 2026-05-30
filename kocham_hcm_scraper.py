"""
코참 호치민 (kocham.kr) 회원사 이메일 스크래퍼
============================================
- 한노이 사이트(kochamvietnam.com)와는 다른 별도 사이트
- 사이트가 약한 Diffie-Hellman 키를 사용 → SSL SECLEVEL을 낮춰 우회
- 리스트 페이지(sub03_1.php)를 페이지네이션으로 순회하며 wr_id 수집
- 각 상세 페이지(detail.php?wr_id=)에서 구조화된 필드 추출

실행 전:
  pip install requests beautifulsoup4

실행:
  python kocham_hcm_scraper.py

결과: kocham_hcm_emails.csv (Excel 호환 utf-8-sig)
"""

import sys
import csv
import time
import re
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

LIST_URL = "https://kocham.kr/theme/inet/sub/sub03_1.php?page={}&bo_table=upjong"
DETAIL_URL = "https://kocham.kr/theme/inet/sub/detail.php?wr_id={}"
OUTPUT_FILE = "kocham_hcm_emails.csv"

PAGE_START = 1
PAGE_END = 115
SLEEP_LIST = 0.5
SLEEP_DETAIL = 0.4

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}

# 사이트 자체 관리자/시스템 이메일은 제외
EXCLUDE_KEYWORDS = ['kocham@', 'sirsoft', 'example', 'noreply', 'webmaster@kocham']


class LowSecAdapter(HTTPAdapter):
    """kocham.kr이 약한 DH 키를 쓰므로 SSL SECLEVEL을 낮춰 핸드셰이크 허용."""
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.set_ciphers('DEFAULT@SECLEVEL=0')
        ctx.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)


def make_session():
    s = requests.Session()
    s.mount('https://', LowSecAdapter())
    s.headers.update(HEADERS)
    return s


def collect_wr_ids(session):
    """리스트 페이지를 순회하며 모든 wr_id 수집."""
    all_ids = []
    seen = set()
    print(f"[1단계] 리스트 페이지 {PAGE_START}~{PAGE_END} 순회하며 wr_id 수집")
    for page in range(PAGE_START, PAGE_END + 1):
        try:
            r = session.get(LIST_URL.format(page), timeout=20)
            html = r.content.decode('utf-8', errors='replace')
            ids = [int(m) for m in re.findall(r'wr_id=(\d+)', html)]
            new = [i for i in ids if i not in seen]
            for i in new:
                seen.add(i)
                all_ids.append(i)
            if page == 1 or page % 20 == 0 or page == PAGE_END:
                print(f"  페이지 {page:3d}: 누적 {len(all_ids)}개 (이번 페이지 신규 {len(new)}개)")
        except Exception as e:
            print(f"  페이지 {page} 오류: {e}")
        time.sleep(SLEEP_LIST)
    print(f"  → 총 {len(all_ids)}개 wr_id 수집")
    return all_ids


def extract_emails(text):
    pattern = r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
    found = re.findall(pattern, text)
    cleaned = []
    seen = set()
    for e in found:
        el = e.lower()
        if any(kw in el for kw in EXCLUDE_KEYWORDS):
            continue
        if el in seen:
            continue
        seen.add(el)
        cleaned.append(el)
    return cleaned


def field_after(soup_text, label, stops=None):
    """본문 텍스트에서 'label' 다음 줄(공백 제거)을 추출. stops에 도달하면 멈춤."""
    if stops is None:
        stops = []
    lines = [l.strip() for l in soup_text.split('\n')]
    label = label.strip()
    for i, l in enumerate(lines):
        if l == label:
            # 다음 비어있지 않은 줄 반환
            for j in range(i + 1, min(i + 4, len(lines))):
                v = lines[j].strip()
                if v and v not in stops:
                    return v
            break
    return ""


def scrape_detail(session, wr_id):
    try:
        url = DETAIL_URL.format(wr_id)
        r = session.get(url, timeout=20)
        if r.status_code != 200:
            return None
        html = r.content.decode('utf-8', errors='replace')
        if len(html) < 500:
            return None
        soup = BeautifulSoup(html, 'html.parser')
        text = soup.get_text(separator='\n')

        # 푸터 정보(코참 자체 이메일/주소)는 본문 분석에서 제외
        # 본문 영역만 추출 — '업종별/지역별' 헤더와 '목록' 사이 영역
        # 단순화: 라인 기반 라벨 매칭 사용
        emails = extract_emails(text)
        if not emails:
            return None

        company = field_after(text, 'Company name')
        director = field_after(text, 'General Director')
        biz_type = field_after(text, 'Type of business')
        tel = field_after(text, 'Tel')
        area = field_after(text, 'Area')
        address = field_after(text, 'Address')
        homepage = field_after(text, 'Homepage')
        # 'E-mail' 라벨 다음 값 — 단, 푸터의 '이메일'(kocham@)이 아닌 본문 E-mail
        email_raw = field_after(text, 'E-mail')

        return {
            'wr_id': wr_id,
            'company': company,
            'director': director,
            'industry': biz_type,
            'area': area,
            'address': address,
            'tel': tel,
            'homepage': homepage if homepage and '@' not in homepage else '',
            'emails': ', '.join(emails),
            'email_primary': email_raw if email_raw and '@' in email_raw else (emails[0] if emails else ''),
            'url': url,
        }
    except Exception as e:
        print(f"  오류 wr_id={wr_id}: {e}")
        return None


def main():
    session = make_session()

    print("=" * 60)
    print("  코참 호치민 (kocham.kr) 회원사 이메일 수집")
    print("=" * 60)

    wr_ids = collect_wr_ids(session)
    if not wr_ids:
        print("수집된 wr_id 없음 — 사이트 구조 변경 가능성")
        return

    print(f"\n[2단계] 상세 페이지 {len(wr_ids)}개 수집 시작")
    results = []
    no_email_count = 0
    for i, wid in enumerate(wr_ids, 1):
        result = scrape_detail(session, wid)
        if result:
            results.append(result)
            if i % 25 == 0 or i == 1 or i == len(wr_ids):
                pct = i * 100 // len(wr_ids)
                print(f"  [{i:4d}/{len(wr_ids)} {pct:3d}%] wr_id={wid} | {result['company'][:30]:<30} | {result['emails'][:50]}")
        else:
            no_email_count += 1
        time.sleep(SLEEP_DETAIL)

    print("\n" + "=" * 60)
    if results:
        with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['wr_id', 'company', 'director', 'industry', 'area',
                          'address', 'tel', 'homepage', 'email_primary', 'emails', 'url']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)
        print(f"  완료! 이메일 수집: {len(results)}개 기업")
        print(f"  이메일 없음: {no_email_count}개")
        print(f"  저장 파일: {OUTPUT_FILE}")
    else:
        print("  수집된 데이터 없음")
    print("=" * 60)


if __name__ == "__main__":
    main()
