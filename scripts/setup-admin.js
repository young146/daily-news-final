/**
 * Setup initial admin user on fresh Supabase DB
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const count = await prisma.user.count();
  console.log('Existing users:', count);
  
  if (count === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        email: 'admin@chaovietnam.co.kr',
        password: hash,
        role: 'ADMIN',
        name: 'Admin'
      }
    });
    console.log('✅ Admin user created!');
  } else {
    console.log('Users already exist, skipping.');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
