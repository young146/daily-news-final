/**
 * Migrate data from Neon to Supabase
 * Usage: node scripts/migrate-to-supabase.js
 */
const { PrismaClient } = require('@prisma/client');

const NEON_URL = 'postgresql://neondb_owner:npg_1uQoeKFAcS7V@ep-weathered-cloud-a19duqhi-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const SUPABASE_URL = 'postgresql://postgres.teyqknaswblxfiackyxx:SfetgKJBeRjsJTa0@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres';

const neon = new PrismaClient({ datasources: { db: { url: NEON_URL } } });
const supabase = new PrismaClient({ datasources: { db: { url: SUPABASE_URL } } });

async function migrateTable(name, findFn, createFn) {
  try {
    const items = await findFn();
    console.log(`[${name}] Found ${items.length} records in Neon`);
    
    let success = 0, skip = 0, fail = 0;
    for (const item of items) {
      try {
        // Remove auto-generated fields that might conflict
        const data = { ...item };
        delete data.updatedAt; // Let Prisma handle this
        
        await createFn(data);
        success++;
      } catch (e) {
        if (e.code === 'P2002') {
          skip++; // Duplicate, already exists
        } else {
          fail++;
          console.error(`[${name}] Failed:`, e.message);
        }
      }
    }
    console.log(`[${name}] Done: ${success} created, ${skip} skipped, ${fail} failed`);
  } catch (e) {
    console.error(`[${name}] ERROR reading from Neon:`, e.message);
  }
}

async function main() {
  console.log('=== Neon → Supabase Migration ===\n');
  
  // Test connections
  try {
    const neonCount = await neon.newsItem.count();
    console.log(`Neon connection OK (${neonCount} news items)\n`);
  } catch (e) {
    console.error('❌ Cannot connect to Neon:', e.message);
    console.log('\nNeon quota exceeded - will migrate schema only (no data).');
    console.log('Data can be migrated after Neon resets (April 1st).\n');
    await neon.$disconnect();
    await supabase.$disconnect();
    return;
  }

  try {
    await supabase.newsItem.count();
    console.log('Supabase connection OK\n');
  } catch (e) {
    console.error('❌ Cannot connect to Supabase:', e.message);
    await neon.$disconnect();
    await supabase.$disconnect();
    return;
  }

  // Migrate each table
  await migrateTable('NewsItem',
    () => neon.newsItem.findMany(),
    (data) => supabase.newsItem.create({ data })
  );

  await migrateTable('User',
    () => neon.user.findMany(),
    (data) => supabase.user.create({ data })
  );

  await migrateTable('Subscriber',
    () => neon.subscriber.findMany(),
    (data) => supabase.subscriber.create({ data })
  );

  await migrateTable('PromoCard',
    () => neon.promoCard.findMany(),
    (data) => supabase.promoCard.create({ data })
  );

  await migrateTable('TestEmail',
    () => neon.testEmail.findMany(),
    (data) => supabase.testEmail.create({ data })
  );

  await migrateTable('CrawlerLog',
    () => neon.crawlerLog.findMany(),
    (data) => supabase.crawlerLog.create({ data })
  );

  await migrateTable('EmailSendLog',
    () => neon.emailSendLog.findMany({ include: { details: true } }),
    async (data) => {
      const details = data.details || [];
      delete data.details;
      const log = await supabase.emailSendLog.create({ data });
      for (const detail of details) {
        delete detail.id;
        detail.logId = log.id;
        delete detail.updatedAt;
        await supabase.emailSendDetail.create({ data: detail });
      }
    }
  );

  await migrateTable('ClickLog',
    () => neon.clickLog.findMany(),
    (data) => supabase.clickLog.create({ data })
  );

  console.log('\n=== Migration Complete ===');
  
  await neon.$disconnect();
  await supabase.$disconnect();
}

main().catch(console.error);
