// 통합검색 색인 테이블 초기화 (1회성, 멱등)
// - 기존 테이블은 일절 건드리지 않음 (CREATE ... IF NOT EXISTS 만 사용)
// - pg_trgm 확장 + searchText GIN trgm 인덱스(한글 부분일치·오타 보정)
// 컬럼은 prisma/schema.prisma 의 SearchIndex 모델과 정확히 일치해야 함.
// 사용: node scripts/init-search-index.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 SearchIndex 테이블 초기화...');
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SearchIndex" (
      "id"          TEXT PRIMARY KEY,
      "type"        TEXT NOT NULL,
      "title"       TEXT NOT NULL,
      "summary"     TEXT,
      "url"         TEXT,
      "searchText"  TEXT NOT NULL,
      "city"        TEXT,
      "district"    TEXT,
      "category"    TEXT,
      "lat"         DOUBLE PRECISION,
      "lng"         DOUBLE PRECISION,
      "priority"    INTEGER NOT NULL DEFAULT 0,
      "publishedAt" TIMESTAMP(3),
      "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // 전화·주소 컬럼 추가 (기존 테이블에도 멱등 적용)
  await prisma.$executeRawUnsafe(`ALTER TABLE "SearchIndex" ADD COLUMN IF NOT EXISTS "phone" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "SearchIndex" ADD COLUMN IF NOT EXISTS "address" TEXT;`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SearchIndex_type_city_idx" ON "SearchIndex" ("type", "city");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SearchIndex_publishedAt_idx" ON "SearchIndex" ("publishedAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SearchIndex_searchText_trgm_idx" ON "SearchIndex" USING gin ("searchText" gin_trgm_ops);`);
  // 관리자 수정 보관 테이블 (야간 재색인에도 보존)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DirectoryEdit" (
      "id"        TEXT PRIMARY KEY,
      "overrides" JSONB,
      "extra"     TEXT,
      "updatedBy" TEXT,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "SearchIndex";`);
  console.log('✅ 완료. 현재 행수:', rows[0].n);
  await prisma.$disconnect();
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
