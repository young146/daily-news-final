/**
 * Restore subscribers from emails-sent CSV backup
 * Extracts unique email addresses from the CSV 'to' column
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  // Read CSV file
  const csv = fs.readFileSync('emails-sent-1773115599212.csv', 'utf8');
  const lines = csv.split('\n').filter(l => l.trim());
  
  // Parse header
  const header = lines[0].split(',');
  const toIndex = header.indexOf('to');
  console.log('CSV columns:', header.join(', '));
  console.log('Total rows:', lines.length - 1);
  console.log('"to" column index:', toIndex);

  // Extract unique emails from 'to' column
  const emails = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const email = (cols[toIndex] || '').trim().toLowerCase();
    if (email && email.includes('@') && !email.includes(' ')) {
      emails.add(email);
    }
  }

  console.log(`\nFound ${emails.size} unique subscriber emails\n`);

  // Insert into Supabase
  let created = 0, skipped = 0, failed = 0;
  for (const email of emails) {
    try {
      await prisma.subscriber.create({
        data: {
          email: email,
          isActive: true,
        }
      });
      created++;
    } catch (e) {
      if (e.code === 'P2002') {
        skipped++; // Already exists
      } else {
        failed++;
        console.error(`Failed: ${email}:`, e.message);
      }
    }
  }

  console.log(`\n=== Subscriber Restore Complete ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped (duplicate): ${skipped}`);
  console.log(`Failed: ${failed}`);
  
  const total = await prisma.subscriber.count();
  console.log(`\nTotal subscribers in DB: ${total}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
