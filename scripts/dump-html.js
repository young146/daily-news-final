import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

async function main() {
  const cards = await prisma.promoCard.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 3
  });
  
  let htmlOutput = "";
  cards.forEach((c, i) => {
      htmlOutput += `\n\n=== CARD ${i+1}: ${c.title} ===\n\n`;
      htmlOutput += c.description;
  });
  
  fs.writeFileSync('C:\\xinchao-news-final\\daily-news-final\\scripts\\debug-cards.html', htmlOutput);
  console.log("Saved to debug-cards.html");
}

main().catch(console.error).finally(() => prisma.$disconnect());
