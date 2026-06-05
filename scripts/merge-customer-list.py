# -*- coding: utf-8 -*-
"""
고객 통합 이메일 리스트(xlsx)를 기존 구독자 CSV에 병합 — 이메일 기준 중복 제거.

입력:
  - 기존 구독자: subscribers_all_2026-06-05.csv (회사명,이메일,이름,전화번호,상태,구독 일시)
  - 신규 통합:   고객_통합_이메일리스트.xlsx (구분,이름/담당자,업체명,이메일,전화,모바일,주소,출처)

출력 (.tmp/merge/):
  - new_subscribers_addable.csv   : 신규(미존재) 이메일만 — DB import용 (email,company,name,phone)
  - subscribers_merged.csv        : 전체 병합본 — 기존 포맷 (회사명,이메일,이름,전화번호,상태,구독 일시)
  - overlap_existing.csv          : 이미 구독자라 제외된 항목 (참고용)

이메일 정규화: 앞뒤 공백 제거 + 소문자. 이게 중복 판정 기준.
"""
import csv, re, os, sys, datetime, io
import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_IN  = os.environ.get('SUBS_CSV', r'C:/Users/XINCHAO/Downloads/subscribers_all_2026-06-05.csv')
XLSX_IN = os.environ.get('XLSX_IN', r'C:/Users/XINCHAO/Downloads/고객_통합_이메일리스트.xlsx')
OUT_DIR = os.path.join(ROOT, '.tmp', 'merge')
os.makedirs(OUT_DIR, exist_ok=True)

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
def norm(e):
    return (e or '').strip().lower()

# ---------- 1. 기존 구독자 읽기 ----------
existing_rows = []
existing_set = set()
with open(CSV_IN, encoding='utf-8-sig', newline='') as f:
    rdr = csv.reader(f)
    header = next(rdr)
    for r in rdr:
        if len(r) < 2:
            continue
        existing_rows.append(r)
        e = norm(r[1])
        if e:
            existing_set.add(e)

# ---------- 2. 통합 리스트(xlsx) 읽기 ----------
wb = openpyxl.load_workbook(XLSX_IN, read_only=True)
ws = wb.active
xrows = list(ws.iter_rows(values_only=True))
xhdr = [str(h).strip() if h is not None else '' for h in xrows[0]]
def col(name):
    return xhdr.index(name) if name in xhdr else -1
C_GUBUN, C_NAME, C_COMPANY = col('구분'), col('이름/담당자'), col('업체명')
C_EMAIL, C_TEL, C_MOBILE   = col('이메일'), col('전화'), col('모바일')

def cell(row, i):
    if i < 0 or i >= len(row) or row[i] is None:
        return ''
    return str(row[i]).strip()

seen = set()
new_records = []      # 진짜 신규
overlap_records = []  # 이미 구독자
dup_in_xlsx = 0
invalid = 0
for row in xrows[1:]:
    email = norm(cell(row, C_EMAIL))
    if not email or not EMAIL_RE.match(email):
        invalid += 1
        continue
    if email in seen:
        dup_in_xlsx += 1
        continue
    seen.add(email)
    gubun = cell(row, C_GUBUN)
    # 구분: 광고주 → CRM 고객(isCustomer=true), 개인회원 → 일반 구독자(false)
    is_customer = (gubun == '광고주')
    rec = {
        'email':   email,
        'company': cell(row, C_COMPANY),
        'name':    cell(row, C_NAME),
        'phone':   cell(row, C_TEL) or cell(row, C_MOBILE),
        'gubun':   gubun,
        'isCustomer': is_customer,
    }
    if email in existing_set:
        overlap_records.append(rec)
    else:
        new_records.append(rec)

# ---------- 3. 출력 ----------
def w(path, header, rows):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        wr = csv.writer(f)
        wr.writerow(header)
        wr.writerows(rows)

# (a) 신규 import용 — isCustomer 분류 포함 (광고주=true, 개인회원=false)
w(os.path.join(OUT_DIR, 'new_subscribers_addable.csv'),
  ['email', 'company', 'name', 'phone', 'isCustomer'],
  [[r['email'], r['company'], r['name'], r['phone'], 'true' if r['isCustomer'] else 'false'] for r in new_records])

# (a2) 전체 분류본 — 라이브 DB 대조/업그레이드용 (신규+기존 모두)
all_recs = new_records + overlap_records
w(os.path.join(OUT_DIR, 'all_classified.csv'),
  ['email', 'company', 'name', 'phone', 'isCustomer'],
  [[r['email'], r['company'], r['name'], r['phone'], 'true' if r['isCustomer'] else 'false'] for r in all_recs])

# (b) 겹침 참고용
w(os.path.join(OUT_DIR, 'overlap_existing.csv'),
  ['email', 'company', 'name', 'phone', 'gubun'],
  [[r['email'], r['company'], r['name'], r['phone'], r['gubun']] for r in overlap_records])

# (c) 전체 병합본 — 기존 포맷 유지, 신규는 활성/오늘 날짜
today = datetime.date.today().strftime('%Y. %-m. %-d.') if os.name != 'nt' else datetime.date.today().strftime('%Y. %#m. %#d.')
merged = list(existing_rows)
for r in new_records:
    merged.append([r['company'], r['email'], r['name'], r['phone'], '활성', today + ' 통합리스트 추가'])
w(os.path.join(OUT_DIR, 'subscribers_merged.csv'), header, merged)

# ---------- 4. 리포트 ----------
print('=' * 56)
print('  고객 통합 리스트 → 구독자 병합 결과')
print('=' * 56)
print(f'  기존 구독자(고유 이메일)   : {len(existing_set):>6,}')
print(f'  통합 리스트 유효 이메일     : {len(seen):>6,}  (무효 {invalid}, 파일내중복 {dup_in_xlsx} 제외)')
print(f'  └ 이미 구독자(겹침/제외)    : {len(overlap_records):>6,}')
new_cust = sum(1 for r in new_records if r['isCustomer'])
new_indiv = len(new_records) - new_cust
print(f'  └ 신규 추가 대상            : {len(new_records):>6,}')
print(f'      · 광고주→고객(isCustomer) : {new_cust:>6,}')
print(f'      · 개인회원→일반 구독자    : {new_indiv:>6,}')
print(f'  병합 후 총 구독자          : {len(existing_set) + len(new_records):>6,}')
print('-' * 56)
print(f'  출력 폴더: {OUT_DIR}')
print('   - new_subscribers_addable.csv  (신규 %d건, import용)' % len(new_records))
print('   - subscribers_merged.csv       (전체 %d건)' % len(merged))
print('   - overlap_existing.csv         (제외 %d건)' % len(overlap_records))
