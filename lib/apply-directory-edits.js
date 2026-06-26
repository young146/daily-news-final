// 관리자 수정(overrides)을 SearchIndex 행에 반영 — 검색 결과에도 즉시 적용되게.
// 저장 시 1건, 야간 재색인 후 전체 재적용에 공용으로 사용. (CommonJS — 스크립트/라우트 양쪽에서 사용)

// overrides + 기존 행 → 색인의 핵심 표시 항목
function pickCore(overrides, row) {
  const o = overrides || {};
  const phone = o.tel || o.mobile || o.phone || row.phone || null;
  return {
    title: o.title || row.title,
    summary: o.summary != null ? o.summary : row.summary,
    phone,
    address: o.address != null ? o.address : row.address,
    city: o.city != null ? o.city : row.city,
    district: o.district != null ? o.district : row.district,
    category: o.category != null ? o.category : row.category,
    url: o.url != null ? o.url : row.url,
  };
}

// id 한 건의 overrides 를 SearchIndex 에 반영. searchText 에 수정값을 더해 검색도 됨.
async function applyEditToIndex(prisma, id, overrides) {
  const row = await prisma.searchIndex.findUnique({ where: { id } });
  if (!row) return false;
  const core = pickCore(overrides, row);
  const extraText = Object.values(overrides || {})
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  // 기존 searchText 에 수정값 추가(옛 이름·새 이름 모두 검색됨)
  const searchText = `${row.searchText} ${extraText}`.replace(/\s+/g, ' ').trim();
  await prisma.searchIndex.update({ where: { id }, data: { ...core, searchText } });
  return true;
}

// 모든 DirectoryEdit 를 SearchIndex 에 재적용 (야간 재색인 직후 호출)
async function reapplyAllEdits(prisma) {
  const edits = await prisma.directoryEdit.findMany({ select: { id: true, overrides: true } });
  let n = 0;
  for (const e of edits) {
    if (e.overrides && (await applyEditToIndex(prisma, e.id, e.overrides))) n++;
  }
  return n;
}

module.exports = { applyEditToIndex, reapplyAllEdits, pickCore };
