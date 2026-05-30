"""
kochamvietnam.com 전체 기업 디렉토리 스크래퍼
URL: https://kochamvietnam.com/service/directory/company/list?cp=N
총 281페이지, 약 2,809개 예상

출력: kocham_hanoi_directory.csv
"""

import sys
import csv
import time
import requests
from bs4 import BeautifulSoup

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_URL = 'https://kochamvietnam.com/service/directory/company/list'
OUTPUT = 'kocham_hanoi_directory.csv'
DELAY = 0.7
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Referer': 'https://kochamvietnam.com/',
}


def get_total_pages(soup):
    last_btn = soup.select_one('a.p-pager.last')
    if last_btn and last_btn.get('data-cp'):
        return int(last_btn['data-cp'])
    # fallback: 마지막 페이지 번호 버튼
    btns = soup.select('div.page-num a.p-pager')
    if btns:
        return max(int(b['data-cp']) for b in btns if b.get('data-cp', '').isdigit())
    return 1


def scrape_page(cp, session):
    url = BASE_URL + (f'?cp={cp}' if cp > 1 else '')
    try:
        resp = session.get(url, timeout=30)
        resp.encoding = 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')
    except Exception as e:
        print(f'  [page {cp}] 요청 오류: {e}')
        return [], None

    table = soup.select_one('div.t-type02 table')
    if not table:
        return [], soup

    tbody = table.find('tbody')
    if not tbody:
        return [], soup

    rows = tbody.find_all('tr', recursive=False)
    companies = []
    i = 0
    while i < len(rows):
        row1 = rows[i]
        row2 = rows[i + 1] if i + 1 < len(rows) else None
        i += 2

        tds1 = row1.find_all('td', recursive=False)
        if len(tds1) < 2:
            i -= 1  # 쌍이 안 맞으면 1행씩만 진행
            continue

        # 지역 (rowspan=2 첫 번째 td)
        region = tds1[0].get_text(strip=True)

        # 업종·회사명
        box_text = tds1[1].find('div', class_='box-text')
        if not box_text:
            continue

        # 업종: <p><small><strong>[...]</strong></small></p>
        industry = ''
        p_el = box_text.find('p')
        if p_el:
            raw = p_el.get_text(strip=True)
            industry = raw.strip('[]').strip()

        # 한글명: box-text 직속 <strong> (p나 small 밖)
        korean_name = ''
        for tag in box_text.children:
            if hasattr(tag, 'name') and tag.name == 'strong':
                korean_name = tag.get_text(strip=True)
                break

        # 영문명: box-text 직속 <small> (p 밖)
        english_name = ''
        for tag in box_text.children:
            if hasattr(tag, 'name') and tag.name == 'small':
                english_name = tag.get_text(strip=True)
                break

        # 전화
        tel = tds1[2].get_text(strip=True) if len(tds1) > 2 else ''

        # 주소 (row2)
        address = ''
        if row2:
            block_add = row2.find('div', class_='block-add')
            if block_add:
                parts = []
                for p in block_add.find_all('p'):
                    # <strong><small>OFFICE:</small></strong> 레이블 제거
                    for strong in p.find_all('strong'):
                        strong.decompose()
                    text = p.get_text(separator=' ', strip=True)
                    if text:
                        parts.append(text)
                address = ' | '.join(parts)

        company = korean_name if korean_name else english_name

        companies.append({
            'company':      company,
            'company_ko':   korean_name,
            'company_en':   english_name,
            'industry':     industry,
            'area':         region,
            'address':      address,
            'tel':          tel,
            'director':     '',
            'homepage':     '',
            'emails':       '',
            'source':       'KOCHAM_HN_DIR',
            'urls':         '',
        })

    return companies, soup


def main():
    session = requests.Session()
    session.headers.update(HEADERS)

    # 1페이지로 총 페이지 수 확인
    print('총 페이지 수 확인 중...')
    _, soup1 = scrape_page(1, session)
    total_pages = get_total_pages(soup1) if soup1 else 281
    print(f'총 {total_pages}페이지 스크래핑 시작')

    all_companies = []
    # 1페이지는 이미 soup 있으므로 다시 파싱
    companies1, _ = scrape_page(1, session)
    all_companies.extend(companies1)
    print(f'  페이지 1/{total_pages} — {len(companies1)}개 (누적 {len(all_companies)})')

    for cp in range(2, total_pages + 1):
        time.sleep(DELAY)
        companies, _ = scrape_page(cp, session)
        all_companies.extend(companies)
        if cp % 20 == 0 or cp == total_pages:
            print(f'  페이지 {cp}/{total_pages} — 이번 {len(companies)}개 (누적 {len(all_companies)})')

    fields = ['company', 'company_ko', 'company_en', 'industry', 'area',
              'address', 'tel', 'director', 'homepage', 'emails', 'source', 'urls']
    with open(OUTPUT, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(all_companies)

    print(f'\n완료: {OUTPUT} — 총 {len(all_companies)}개')


if __name__ == '__main__':
    main()
