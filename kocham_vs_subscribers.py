"""
코참 이메일 리스트 vs 기존 구독자/바운스 비교
=========================================
입력:
  - kocham_all_emails.csv       : 코참 통합 이메일 (3,174건)
  - subscribers_export.csv      : DB에서 export한 전체 구독자 (4,511명)
  - suppression_bounces (1).csv : SendGrid suppression list (139건)
  - bounced-list.txt            : 추가 바운스 리스트 (397건)

출력:
  - kocham_addable.csv     : 진짜 신규 추가 가능 이메일 (구독자/바운스 제외)
  - kocham_already_sub.csv : 이미 구독 중인 코참 이메일 (활성/비활성 표시)
  - kocham_bounced.csv     : 바운스 목록에 있어 추가하면 안 되는 코참 이메일
"""

import sys
import csv

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

KOCHAM_FILE = 'kocham_all_emails.csv'
SUB_FILE = 'subscribers_export.csv'
SUPP_FILE = 'suppression_bounces (1).csv'
BOUNCED_TXT = 'bounced-list.txt'

OUT_ADDABLE = 'kocham_addable.csv'
OUT_ALREADY_SUB = 'kocham_already_sub.csv'
OUT_BOUNCED = 'kocham_bounced.csv'


def norm(e: str) -> str:
    return e.strip().lower() if e else ''


def load_kocham():
    rows = []
    with open(KOCHAM_FILE, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


def load_subscribers():
    """DB export → email lowercase set + 활성 여부 dict."""
    by_email = {}
    with open(SUB_FILE, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            em = norm(r.get('email', ''))
            if not em:
                continue
            by_email[em] = {
                'is_active': r.get('isActive', '').lower() == 'true',
                'company': r.get('company', ''),
                'name': r.get('name', ''),
                'createdAt': r.get('createdAt', ''),
            }
    return by_email


def load_bounces():
    """suppression CSV + bounced-list.txt 합쳐서 set."""
    bounces = set()
    # SendGrid suppression
    try:
        with open(SUPP_FILE, encoding='utf-8-sig') as f:
            for r in csv.DictReader(f):
                em = norm(r.get('email', ''))
                if em:
                    bounces.add(em)
    except FileNotFoundError:
        pass
    # bounced-list.txt
    try:
        with open(BOUNCED_TXT, encoding='utf-8') as f:
            for line in f:
                em = norm(line)
                if em:
                    bounces.add(em)
    except FileNotFoundError:
        pass
    return bounces


def write_csv(path, rows, fieldnames):
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def main():
    kocham = load_kocham()
    subs = load_subscribers()
    bounces = load_bounces()

    print('=' * 60)
    print('  코참 이메일 vs 기존 구독자/바운스 비교')
    print('=' * 60)
    active_subs = sum(1 for v in subs.values() if v['is_active'])
    inactive_subs = len(subs) - active_subs
    print(f'  코참 통합 이메일: {len(kocham):,}건')
    print(f'  기존 구독자: {len(subs):,}명 (활성 {active_subs:,} / 비활성 {inactive_subs:,})')
    print(f'  바운스 목록: {len(bounces):,}건 (suppression + bounced-list 합산 dedup)')
    print()

    addable = []     # 진짜 신규
    already = []     # 이미 구독 (활성/비활성)
    bounced = []     # 바운스됨

    for r in kocham:
        em = norm(r['email'])
        if not em:
            continue
        if em in bounces:
            bounced.append({
                'email': em,
                'company': r.get('company', ''),
                'director': r.get('director', ''),
                'area': r.get('area', ''),
                'source': r.get('source', ''),
                'in_subscribers': 'YES' if em in subs else 'NO',
                'sub_active': ('YES' if subs[em]['is_active'] else 'NO') if em in subs else '',
            })
        elif em in subs:
            already.append({
                'email': em,
                'company': r.get('company', ''),
                'director': r.get('director', ''),
                'area': r.get('area', ''),
                'source': r.get('source', ''),
                'sub_active': 'YES' if subs[em]['is_active'] else 'NO',
                'sub_company': subs[em]['company'],
                'sub_createdAt': subs[em]['createdAt'][:10] if subs[em]['createdAt'] else '',
            })
        else:
            addable.append({
                'email': em,
                'company': r.get('company', ''),
                'director': r.get('director', ''),
                'area': r.get('area', ''),
                'source': r.get('source', ''),
                'url': r.get('url', ''),
            })

    write_csv(OUT_ADDABLE, addable,
              ['email', 'company', 'director', 'area', 'source', 'url'])
    write_csv(OUT_ALREADY_SUB, already,
              ['email', 'company', 'director', 'area', 'source',
               'sub_active', 'sub_company', 'sub_createdAt'])
    write_csv(OUT_BOUNCED, bounced,
              ['email', 'company', 'director', 'area', 'source',
               'in_subscribers', 'sub_active'])

    # 통계
    print('-' * 60)
    print(f'  📥 신규 추가 가능 (addable):     {len(addable):>5,}건  → {OUT_ADDABLE}')
    print(f'  🔁 이미 구독 중 (중복):           {len(already):>5,}건  → {OUT_ALREADY_SUB}')
    sub_active_match = sum(1 for r in already if r['sub_active'] == 'YES')
    sub_inactive_match = len(already) - sub_active_match
    print(f'      └ 활성 구독자: {sub_active_match:,} / 비활성: {sub_inactive_match:,}')
    print(f'  ⛔ 바운스 목록 (제외):           {len(bounced):>5,}건  → {OUT_BOUNCED}')
    bounced_in_subs = sum(1 for r in bounced if r['in_subscribers'] == 'YES')
    print(f'      └ 그 중 구독자 명단에도 있음: {bounced_in_subs:,} (정리 대상)')
    print('-' * 60)
    print(f'  검증: {len(addable)} + {len(already)} + {len(bounced)} = '
          f'{len(addable) + len(already) + len(bounced)} (코참 입력 {len(kocham)})')
    print('=' * 60)


if __name__ == '__main__':
    main()
