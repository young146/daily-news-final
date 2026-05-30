"""
kocham_hanoi_directory.csv (하노이 전체 디렉토리) 를
kocham_all_companies.csv (기존 통합 DB) 에 병합

- 기존 데이터(이메일·대표자·홈페이지 있는 것)는 그대로 유지
- 신규 = 기존에 없는 회사만 추가 (정규화 이름으로 중복 판별)
- 출력: kocham_all_companies.csv (업데이트)
"""

import sys
import csv
import re
import unicodedata

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

EXISTING = 'kocham_all_companies.csv'
NEW_DIR  = 'kocham_hanoi_directory.csv'
OUTPUT   = 'kocham_all_companies.csv'

# 하노이 디렉토리 지역명 → 우리 표준명 매핑
AREA_MAP = {
    'HA NOI':       'HANOI',
    'HÀ NỘI':      'HANOI',
    'HANOI':        'HANOI',
    'BẮC GIANG':   'BAC GIANG',
    'BAC GIANG':    'BAC GIANG',
    'BẮC NINH':    'BAC NINH',
    'BAC NINH':     'BAC NINH',
    'HẢI DƯƠNG':   'HAI DUONG',
    'HAI DUONG':    'HAI DUONG',
    'HƯNG YÊN':    'HUNG YEN',
    'HUNG YEN':     'HUNG YEN',
    'HẢI PHÒNG':   'HAI PHONG',
    'HAI PHONG':    'HAI PHONG',
    'THÁI NGUYÊN':  'THAI NGUYEN',
    'THAI NGUYEN':  'THAI NGUYEN',
    'VĨNH PHÚC':   'VINH PHUC',
    'VINH PHUC':    'VINH PHUC',
    'PHÚ THỌ':     'PHU THO',
    'PHU THO':      'PHU THO',
    'QUẢNG NINH':  'QUANG NINH',
    'QUANG NINH':   'QUANG NINH',
    'NAM ĐỊNH':    'NAM DINH',
    'NAM DINH':     'NAM DINH',
    'NINH BÌNH':   'NINH BINH',
    'NINH BINH':    'NINH BINH',
    'THANH HÓA':   'THANH HOA',
    'THANH HOA':    'THANH HOA',
    'NGHỆ AN':     'NGHE AN',
    'NGHE AN':      'NGHE AN',
    'HÀ TĨNH':     'HA TINH',
    'HA TINH':      'HA TINH',
    'ĐÀ NẴNG':     'DA NANG',
    'DA NANG':      'DA NANG',
}


def strip_accents(s):
    return ''.join(
        c for c in unicodedata.normalize('NFKD', s)
        if unicodedata.category(c) != 'Mn'
    )


def normalize_name(name):
    """회사명 정규화: 소문자, 법인 접미사·특수문자 제거."""
    if not name:
        return ''
    s = name.lower().strip()
    # 한글 괄호 내용 제거 (예: "(주)")
    s = re.sub(r'\([가-힣\s]+\)', '', s)
    # 영문 법인 접미사
    for suffix in [
        r'\bco\.,?\s*ltd\.?', r'\bco\.,?\s*llc\.?', r'\bcorporation\b', r'\bcorp\.?',
        r'\binc\.?', r'\bllc\.?', r'\bltd\.?', r'\bjsc\.?', r'\bvina\b',
        r'\bviet\s*nam\b', r'\bvietnam\b', r'\bco\b', r'\bco\.\b',
        r'주식회사', r'유한회사', r'합자회사',
    ]:
        s = re.sub(suffix, '', s, flags=re.IGNORECASE)
    s = re.sub(r'[^\w가-힣]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    # 발음 기호 제거
    s = strip_accents(s)
    return s


def canon_area(raw):
    key = raw.strip().upper()
    return AREA_MAP.get(key, key)


def main():
    # 기존 데이터 로드
    with open(EXISTING, encoding='utf-8-sig') as f:
        existing_rows = list(csv.DictReader(f))
    existing_fields = list(existing_rows[0].keys()) if existing_rows else []

    print(f'기존 데이터: {len(existing_rows)}개')

    # 기존 회사 정규화 키 세트
    existing_keys = set()
    for r in existing_rows:
        name = normalize_name(r.get('company', ''))
        if name:
            existing_keys.add(name)

    # 신규 디렉토리 로드
    with open(NEW_DIR, encoding='utf-8-sig') as f:
        dir_rows = list(csv.DictReader(f))

    print(f'하노이 디렉토리: {len(dir_rows)}개')

    # 신규만 필터링
    added = 0
    skipped = 0
    new_rows = []
    for r in dir_rows:
        key = normalize_name(r.get('company', ''))
        if not key or key in existing_keys:
            skipped += 1
            continue
        existing_keys.add(key)
        added += 1

        area = canon_area(r.get('area', ''))
        new_rows.append({
            'company':  r.get('company', '').strip(),
            'director': '',
            'industry': r.get('industry', '').strip(),
            'area':     area,
            'address':  r.get('address', '').strip(),
            'tel':      r.get('tel', '').strip(),
            'homepage': '',
            'emails':   '',
            'source':   'KOCHAM_HN_DIR',
            'urls':     '',
        })

    print(f'신규 추가: {added}개 / 중복(기존 있음): {skipped}개')

    # 병합 출력
    # 기존 컬럼 구조에 맞춤
    out_fields = existing_fields if existing_fields else [
        'company', 'director', 'industry', 'area', 'address',
        'tel', 'homepage', 'emails', 'source', 'urls'
    ]

    all_out = existing_rows + new_rows
    with open(OUTPUT, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=out_fields, extrasaction='ignore')
        w.writeheader()
        w.writerows(all_out)

    print(f'\n출력: {OUTPUT} — 총 {len(all_out)}개 (기존 {len(existing_rows)} + 신규 {added})')


if __name__ == '__main__':
    main()
