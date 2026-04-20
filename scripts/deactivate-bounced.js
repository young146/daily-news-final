/**
 * deactivate-bounced.js
 * 
 * Reads bounced-list.txt (one email per line) and sets isActive = false
 * for matching subscribers in the database.
 * 
 * Usage: node scripts/deactivate-bounced.js
 * Dry run: node scripts/deactivate-bounced.js --dry-run
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // 1. Read bounced-list.txt
  const filePath = path.join(__dirname, '..', 'bounced-list.txt');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const bouncedEmails = raw
    .split(/\r?\n/)
    .map(line => line.trim().toLowerCase())
    .filter(email => email.length > 0 && email.includes('@'));

  console.log(`📄 Loaded ${bouncedEmails.length} bounced emails from bounced-list.txt`);

  // 2. Check how many of these are currently active subscribers
  const activeMatches = await prisma.subscriber.findMany({
    where: {
      email: { in: bouncedEmails, mode: 'insensitive' },
      isActive: true
    },
    select: { id: true, email: true }
  });

  console.log(`🔍 Found ${activeMatches.length} currently ACTIVE subscribers matching the bounce list`);

  if (activeMatches.length === 0) {
    console.log('✅ No active subscribers to deactivate. Done.');
    return;
  }

  // 3. Show sample
  const sample = activeMatches.slice(0, 10).map(s => s.email);
  console.log(`📋 Sample (first 10): ${sample.join(', ')}`);

  if (DRY_RUN) {
    console.log(`\n🔒 DRY RUN — no changes made. Run without --dry-run to deactivate.`);
    // List all that would be deactivated
    console.log(`\nFull list of ${activeMatches.length} subscribers that WOULD be deactivated:`);
    activeMatches.forEach((s, i) => console.log(`  ${i + 1}. ${s.email}`));
    return;
  }

  // 4. Deactivate
  const result = await prisma.subscriber.updateMany({
    where: {
      email: { in: bouncedEmails, mode: 'insensitive' },
      isActive: true
    },
    data: { isActive: false }
  });

  console.log(`\n✅ Deactivated ${result.count} subscribers successfully.`);
}

main()
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
