"""
코참 한노이 + 호치민 통합 dedup 스크립트
=====================================
입력:
  - kocham_emails.csv      (한노이, kochamvietnam.com)
  - kocham_hcm_emails.csv  (호치민, kocham.kr)

출력:
  1) kocham_all_emails.csv     : 1행=1이메일, SendGrid 업로드용
     컬럼: email | company | director | area | source | url
  2) kocham_all_companies.csv  : 1행=1회사, CRM/사이트 활용용
     컬럼: company | director | industry | area | address | tel | homepage |
            emails | source | urls

중복 제거:
  - 이메일: 소문자 비교로 unique
  - 회사명: 정규화(소문자 + 법인접미사/한글괄호/구두점 제거) 후 비교
"""

import sys
import csv
import re
import unicodedata
from collections import OrderedDict

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HANOI_FILE = "kocham_emails.csv"
HCM_FILE = "kocham_hcm_emails.csv"
OUT_EMAILS = "kocham_all_emails.csv"
OUT_COMPANIES = "kocham_all_companies.csv"

# 베트남 도시/성 추출 - 주소 문자열에서 매칭
# (canonical_name, [keywords]) 순서대로 매칭. 구체적인 것(특정 구/지구) 먼저 검사.
CITY_RULES = [
    # === 하노이 (구 이름까지 포함) ===
    ('HANOI', [
        'hà nội', 'hanoi', 'ha noi',
        # 하노이 구(district) - 주소가 잘려도 구 이름은 보통 남음
        'cau giay', 'cầu giấy', 'tu liem', 'từ liêm', 'tay ho', 'tây hồ',
        'ba dinh', 'ba đình', 'dong da', 'đống đa', 'hoan kiem', 'hoàn kiếm',
        'hai ba trung', 'hai bà trưng', 'thanh xuan', 'thanh xuân',
        'hoang mai', 'hoàng mai', 'long bien', 'long biên',
        'thanh tri', 'thanh trì', 'gia lam', 'gia lâm',
        'dong anh', 'đông anh', 'soc son', 'sóc sơn', 'me linh', 'mê linh',
        'ha dong', 'hà đông', 'son tay', 'sơn tây',
        'yen hoa', 'yên hòa',  # 주요 ward
        'thanh liet', 'thanh liệt',
        'bac tu liem', 'nam tu liem',
        'dai mo', 'đại mỗ', 'me tri', 'mễ trì',
        'keangnam',  # Keangnam Landmark = Hanoi
        'lieu giai', 'liễu giai',
        'cong vi', 'cống vị',
        'nghia do', 'nghĩa đô',
        'my dinh', 'mỹ đình',
        'phuong canh', 'phương canh',
        '하노이', '떠이호',  # 한글 표기
        'cau dien', 'cầu diễn',  # Cau Dien (Nam Tu Liem)
        'noi bai',  # Noi Bai 공항
    ]),
    # === 호치민 ===
    ('HCMC', [
        '호치민', '호찌민',  # 한글 표기
        'hồ chí minh', 'ho chi minh', 'hcmc', 'tp. hcm', 'tphcm', 'tp hcm',
        'tan thuan',  # Tan Thuan EPZ (Quan 7)
        'sai gon', 'sài gòn', 'saigon',
        # HCMC 구
        'quan 1', 'quận 1', 'quan 2', 'quận 2', 'quan 3', 'quận 3',
        'quan 4', 'quận 4', 'quan 5', 'quận 5', 'quan 6', 'quận 6',
        'quan 7', 'quận 7', 'quan 8', 'quận 8', 'quan 9', 'quận 9',
        'quan 10', 'quận 10', 'quan 11', 'quận 11', 'quan 12', 'quận 12',
        'thu duc', 'thủ đức', 'binh thanh', 'bình thạnh',
        'phu nhuan', 'phú nhuận', 'tan binh', 'tân bình',
        'tan phu', 'tân phú', 'go vap', 'gò vấp',
        'binh tan', 'bình tân', 'nha be', 'nhà bè',
        'tan hung',  # Tan Hung Ward (Quan 7)
    ]),
    # === 북부 성 ===
    ('BAC NINH', ['bắc ninh', 'bac ninh', '박닌', 'tu son', 'từ sơn', 'que vo', 'quế võ', 'dai dong', 'đại đồng', 'yen phong', 'yên phong']),
    ('BAC GIANG', ['bắc giang', 'bac giang']),
    ('HUNG YEN', ['hưng yên', 'hung yen', 'pho noi', 'phố nối', 'van lam', 'văn lâm']),
    ('HAI DUONG', ['hải dương', 'hai duong']),
    ('HAI PHONG', ['hải phòng', 'hai phong', 'haiphong']),
    ('VINH PHUC', ['vĩnh phúc', 'vinh phuc']),
    ('THAI NGUYEN', ['thái nguyên', 'thai nguyen']),
    ('PHU THO', ['phú thọ', 'phu tho']),
    ('NAM DINH', ['nam định', 'nam dinh']),
    ('NINH BINH', ['ninh bình', 'ninh binh']),
    ('HA NAM', ['hà nam', 'ha nam', 'duy tien', 'duy tiên']),
    ('QUANG NINH', ['quảng ninh', 'quang ninh']),
    ('THANH HOA', ['thanh hóa', 'thanh hoa']),
    ('NGHE AN', ['nghệ an', 'nghe an']),
    ('HA TINH', ['hà tĩnh', 'ha tinh']),
    # === 중부 ===
    ('DA NANG', ['đà nẵng', 'da nang', 'danang']),
    ('QUANG NAM', ['quảng nam', 'quang nam']),
    ('QUANG NGAI', ['quảng ngãi', 'quang ngai']),
    ('KHANH HOA', ['khánh hòa', 'khanh hoa', 'van phong']),  # Van Phong EZ = Khanh Hoa
    ('THUA THIEN HUE', ['thừa thiên', 'thua thien', 'huế', 'hue']),
    # === 남부 ===
    ('BINH DUONG', ['bình dương', 'binh duong']),
    ('DONG NAI', ['đồng nai', 'dong nai']),
    ('LONG AN', ['long an']),
    ('TAY NINH', ['tây ninh', 'tay ninh']),
    ('BA RIA-VUNG TAU', ['bà rịa', 'ba ria', 'vũng tàu', 'vung tau']),
    ('BINH PHUOC', ['bình phước', 'binh phuoc']),
    ('TIEN GIANG', ['tiền giang', 'tien giang']),
    ('CAN THO', ['cần thơ', 'can tho']),
    ('AN GIANG', ['an giang']),
    ('KIEN GIANG', ['kiên giang', 'kien giang']),
    ('VINH LONG', ['vĩnh long', 'vinh long']),
    ('BEN TRE', ['bến tre', 'ben tre']),
    ('LAM DONG', ['lâm đồng', 'lam dong', 'da lat', 'đà lạt']),
]


# HCM 사이트 area 컬럼의 값을 우리 canonical로 정규화 (예: 'HA NOI' → 'HANOI')
AREA_CANONICAL_MAP = {
    'HA NOI': 'HANOI',
    'HUE': 'THUA THIEN HUE',
    'ETC': '',  # 'ETC'는 의미 없음 - 비워두고 주소에서 재추출 시도
}

# 한국 본사 주소 감지 키워드
KOREA_KEYWORDS = [
    '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '세종',
    '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
    '충청', '경상', '전라',  # 풀네임 도(道) 표기
    'seoul', 'gyeonggi', 'busan', 'incheon', 'korea',
]


def strip_accents(s: str) -> str:
    """베트남어 발음기호 제거: 'Đà Nẵng' → 'Da Nang', 'Hà Nội' → 'Ha Noi'."""
    if not s:
        return s
    # đ/Đ는 NFD에서 분해되지 않으므로 별도 치환
    s = s.replace('đ', 'd').replace('Đ', 'D')
    nfkd = unicodedata.normalize('NFKD', s)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def extract_area_from_address(address: str) -> str:
    """주소 문자열에서 도시/성 이름 추출. 못 찾으면 ''."""
    if not address:
        return ''
    # 한국 주소 우선 검사 (한글/영문 모두)
    a_low = address.lower()
    for kw in KOREA_KEYWORDS:
        if kw in a_low:
            return 'KOREA (HQ)'
    # 베트남어 발음기호 제거 후 비교 → 'Da Năng', 'Đà Nẵng' 모두 매칭
    a_norm = strip_accents(a_low)
    for canonical, keywords in CITY_RULES:
        for kw in keywords:
            if strip_accents(kw) in a_norm:
                return canonical
    return ''


def canonicalize_area(area: str, address: str = '') -> str:
    """입력 area 값을 canonical 이름으로 정규화. 비어있거나 ETC면 주소에서 재추출."""
    if not area:
        return extract_area_from_address(address) if address else ''
    norm = AREA_CANONICAL_MAP.get(area.strip().upper(), area.strip())
    if not norm:  # ETC 같은 경우
        return extract_area_from_address(address) if address else ''
    return norm

# 회사명 정규화 - 제거할 법인 접미사/단어 (대소문자 무시)
LEGAL_SUFFIXES = [
    'co.,ltd', 'co., ltd', 'co.,ltd.', 'co., ltd.',
    'company limited', 'company', 'limited',
    'jsc', 'j.s.c', 'joint stock company',
    'llc', 'l.l.c',
    'corporation', 'corp', 'corp.',
    'inc', 'inc.',
    'ltd', 'ltd.',
    '(주)', '주식회사',
]


def normalize_company(name: str) -> str:
    """회사명 정규화 - 같은 회사 식별용 키 생성."""
    if not name:
        return ""
    s = name.lower().strip()
    # 한글 괄호 부분 제거: "BBC GLOBAL VINA ( 비비씨 글로벌 비나 )" → "BBC GLOBAL VINA"
    s = re.sub(r'\([^)]*[가-힣][^)]*\)', ' ', s)
    # 빈 괄호 제거
    s = re.sub(r'\(\s*\)', ' ', s)
    # 법인 접미사 제거 (긴 것부터)
    for suf in sorted(LEGAL_SUFFIXES, key=len, reverse=True):
        s = re.sub(rf'\b{re.escape(suf)}\b', ' ', s)
    # 구두점 제거
    s = re.sub(r'[^\w\s]', ' ', s)
    # 공백 압축
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def split_emails(s: str):
    if not s:
        return []
    return [e.strip().lower() for e in s.split(',') if e.strip()]


def load_hanoi():
    """한노이 CSV → 통일된 dict 리스트. area는 주소에서 추출."""
    rows = []
    with open(HANOI_FILE, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            address = r.get('address', '').strip()
            rows.append({
                'company': r.get('company', '').strip(),
                'director': '',
                'industry': r.get('industry', '').strip(),
                'area': extract_area_from_address(address),
                'address': address,
                'tel': r.get('tel', '').strip(),
                'homepage': '',
                'emails_list': split_emails(r.get('emails', '')),
                'url': r.get('url', '').strip(),
                'source': 'hanoi',
            })
    return rows


def load_hcm():
    rows = []
    with open(HCM_FILE, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            area = canonicalize_area(r.get('area', '').strip(), r.get('address', '').strip())
            address = r.get('address', '').strip()
            rows.append({
                'company': r.get('company', '').strip(),
                'director': r.get('director', '').strip(),
                'industry': r.get('industry', '').strip(),
                'area': area,
                'address': address,
                'tel': r.get('tel', '').strip(),
                'homepage': r.get('homepage', '').strip(),
                'emails_list': split_emails(r.get('emails', '')),
                'url': r.get('url', '').strip(),
                'source': 'hcm',
            })
    return rows


def build_email_list(all_rows):
    """1이메일=1행. 같은 이메일이 여러 회사에 있으면 source/url 합침."""
    by_email = OrderedDict()
    for r in all_rows:
        for em in r['emails_list']:
            if em in by_email:
                # 기존 항목에 source 추가
                existing = by_email[em]
                if r['source'] not in existing['_sources']:
                    existing['_sources'].add(r['source'])
                    existing['source'] = '+'.join(sorted(existing['_sources']))
                # 더 정보가 많은 쪽 선택 (director/area가 비어있으면 채움)
                for k in ['company', 'director', 'area']:
                    if not existing[k] and r[k]:
                        existing[k] = r[k]
                # URL은 첫 번째 것 유지
            else:
                by_email[em] = {
                    'email': em,
                    'company': r['company'],
                    'director': r['director'],
                    'area': r['area'],
                    'source': r['source'],
                    'url': r['url'],
                    '_sources': {r['source']},
                }
    # _sources 제거
    out = []
    for v in by_email.values():
        v.pop('_sources', None)
        out.append(v)
    return out


def build_company_list(all_rows):
    """1회사=1행. 정규화된 이름이 같으면 병합."""
    by_key = OrderedDict()
    for r in all_rows:
        key = normalize_company(r['company'])
        if not key:
            # 정규화 결과가 비면 이메일 첫 개를 폴백 키로 사용
            key = (r['emails_list'][0] if r['emails_list'] else '__noname_' + r['url'])
        if key in by_key:
            ex = by_key[key]
            # 이메일 합치기
            for em in r['emails_list']:
                if em not in ex['_emails_set']:
                    ex['_emails_set'].add(em)
                    ex['_emails_order'].append(em)
            # 빈 필드 채우기 (호치민이 더 풍부하므로 hcm 데이터 우선 채움)
            for k in ['director', 'industry', 'area', 'address', 'tel', 'homepage']:
                if not ex[k] and r[k]:
                    ex[k] = r[k]
            # 소스 추가
            ex['_sources'].add(r['source'])
            ex['source'] = '+'.join(sorted(ex['_sources']))
            # URL 추가
            if r['url'] and r['url'] not in ex['_urls']:
                ex['_urls'].append(r['url'])
        else:
            by_key[key] = {
                'company': r['company'],
                'director': r['director'],
                'industry': r['industry'],
                'area': r['area'],
                'address': r['address'],
                'tel': r['tel'],
                'homepage': r['homepage'],
                '_emails_set': set(r['emails_list']),
                '_emails_order': list(r['emails_list']),
                'source': r['source'],
                '_sources': {r['source']},
                '_urls': [r['url']] if r['url'] else [],
            }
    out = []
    for v in by_key.values():
        out.append({
            'company': v['company'],
            'director': v['director'],
            'industry': v['industry'],
            'area': v['area'],
            'address': v['address'],
            'tel': v['tel'],
            'homepage': v['homepage'],
            'emails': ', '.join(v['_emails_order']),
            'source': v['source'],
            'urls': ' | '.join(v['_urls']),
        })
    return out


def write_csv(path, rows, fieldnames):
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def main():
    print("=" * 60)
    print("  코참 한노이 + 호치민 통합 dedup")
    print("=" * 60)

    hanoi = load_hanoi()
    hcm = load_hcm()
    print(f"  입력: 한노이 {len(hanoi)}개 회사 / 호치민 {len(hcm)}개 회사")

    all_rows = hanoi + hcm

    # 1) 이메일 리스트
    email_rows = build_email_list(all_rows)
    write_csv(OUT_EMAILS, email_rows,
              ['email', 'company', 'director', 'area', 'source', 'url'])
    cross_site = sum(1 for r in email_rows if '+' in r['source'])
    print(f"\n  [{OUT_EMAILS}]")
    print(f"    → {len(email_rows)}개 고유 이메일 (양쪽 사이트 중복: {cross_site}개)")

    # 2) 회사 리스트
    company_rows = build_company_list(all_rows)
    cross_company = sum(1 for r in company_rows if '+' in r['source'])
    write_csv(OUT_COMPANIES, company_rows,
              ['company', 'director', 'industry', 'area', 'address', 'tel',
               'homepage', 'emails', 'source', 'urls'])
    print(f"\n  [{OUT_COMPANIES}]")
    print(f"    → {len(company_rows)}개 고유 회사 (양쪽 사이트 중복: {cross_company}개)")

    print("\n" + "=" * 60)
    print(f"  원본 합산: {len(hanoi) + len(hcm)}개 회사")
    print(f"  dedup 후: 회사 {len(company_rows)}개 / 이메일 {len(email_rows)}개")
    print("=" * 60)


if __name__ == "__main__":
    main()
