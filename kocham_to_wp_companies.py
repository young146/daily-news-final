"""
kocham_all_companies.csv → WP 디렉토리 import용 정제 파일 생성
============================================================
- 이메일 컬럼 제거 (B안: 비공개 정책)
- 업종 213개 → 12개 큰 그룹으로 분류
- 회사명 표기 정리 (옵션)
- 출력: wp_companies_import.csv
"""

import sys
import csv
import re

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

INPUT = 'kocham_all_companies.csv'
OUTPUT = 'wp_companies_import.csv'

# 업종 메인 카테고리 → 그룹 매핑 (키워드 기반, 부분일치)
# 우선순위 순으로 검사 (앞에 있을수록 높은 우선)
INDUSTRY_GROUPS = [
    ('의료·제약', ['병원', '의약품', '의료', '제약', '의료기기']),
    ('IT·미디어·교육', ['it', '교육', '대중매체', '광고', '통신', '소프트웨어', '인쇄']),
    ('금융·보험', ['금융', '보험']),
    ('법무·회계·자문', ['법무', '회계', '투자자문', '자문', '컨설팅']),
    ('건설·자재', ['건설', '건설자재', '건설 자재', '인테리어', '설비']),
    ('물류·운수·여행', ['물류', '운수', '운송', '여행', '관광']),
    ('숙박·요식·문화', ['숙박', '요식', '급식', '문화', '스포츠', '식품', '음식']),
    ('부동산·임대', ['부동산', '임대']),
    ('농수산·광업', ['농', '임업', '광업', '축산', '수산', '농수산']),
    ('환경·기계', ['환경', '기계']),
    ('대표사무소·지사', ['대표사무소', '지사', '사무소']),
    ('유통·무역', ['유통', '도·소매', '도소매', '무역', '소매']),
    ('섬유·신발·가방', ['섬유', '신발', '가방', '의류', '봉제']),
    ('전자·전기', ['전자', '전기']),
    ('제조업', ['제조', '제조업']),
    ('인증', ['인증']),
]

GROUP_DEFAULT = '기타'


def get_industry_main(industry: str) -> str:
    """원본 업종 문자열에서 메인 카테고리 추출 ('/' 앞부분)."""
    if not industry:
        return ''
    s = industry.strip()
    for sep in [' / ', '/']:
        if sep in s:
            s = s.split(sep)[0].strip()
            break
    # 괄호 부분 제거 (예: "법무자문 (베트남 기업법...)" → "법무자문")
    s = re.sub(r'\(.*?\)', '', s).strip()
    return s


def classify_industry(industry: str) -> str:
    """원본 업종 → 12개 그룹 중 하나로 분류."""
    if not industry:
        return GROUP_DEFAULT
    low = industry.lower()
    for group_name, keywords in INDUSTRY_GROUPS:
        for kw in keywords:
            if kw.lower() in low:
                return group_name
    return GROUP_DEFAULT


def clean_company_display(name: str) -> str:
    """회사명에서 표시용 정제 — 빈 괄호와 공백만 정리. 한글 병기는 유지."""
    if not name:
        return ''
    s = name.strip()
    # 빈 괄호 제거
    s = re.sub(r'\(\s*\)', '', s)
    # 공백 압축
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def main():
    with open(INPUT, encoding='utf-8-sig') as f:
        rows = list(csv.DictReader(f))

    print(f'입력: {len(rows)}개 회사')

    out_rows = []
    group_counter = {}
    for r in rows:
        ind_raw = r.get('industry', '').strip()
        ind_main = get_industry_main(ind_raw)
        ind_group = classify_industry(ind_raw)
        group_counter[ind_group] = group_counter.get(ind_group, 0) + 1
        out_rows.append({
            'company': clean_company_display(r.get('company', '')),
            'director': r.get('director', '').strip(),
            'industry_group': ind_group,
            'industry_detail': ind_main if ind_main else ind_raw,
            'area': r.get('area', '').strip(),
            'address': r.get('address', '').strip(),
            'tel': r.get('tel', '').strip(),
            'homepage': r.get('homepage', '').strip(),
            'email': r.get('emails', '').strip(),
            'source': r.get('source', '').strip(),
            'source_url': (r.get('urls', '') or '').split(' | ')[0],  # 첫 URL만 사용
        })

    with open(OUTPUT, 'w', newline='', encoding='utf-8-sig') as f:
        fields = ['company', 'director', 'industry_group', 'industry_detail',
                  'area', 'address', 'tel', 'homepage', 'email', 'source', 'source_url']
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out_rows)

    print(f'\n출력: {OUTPUT} ({len(out_rows)}개 회사, 이메일 포함)')
    print(f'\n--- 업종 그룹 분포 ---')
    for g in [g for g, _ in INDUSTRY_GROUPS] + [GROUP_DEFAULT]:
        c = group_counter.get(g, 0)
        if c:
            bar = '█' * min(40, c // 20 + 1)
            print(f'  {g:<20} {c:>5}  {bar}')


if __name__ == '__main__':
    main()
