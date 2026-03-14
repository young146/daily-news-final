const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyQRCodes() {
  const card = await prisma.promoCard.findUnique({
    where: { id: 6 }
  });

  if (!card) {
    console.log("Card 6 not found");
    return;
  }

  let desc = card.description;

  // Exact HTML strings found in the DB dump
  const gplayHtml = "https://play.google.com/store/search?q=%EC%94%AC%EC%A7%9C%EC%98%A4%EB%B2%A0%ED%8A%B8%EB%82%A8&amp;c=apps&amp;hl=ko";
  const iosHtml = "https://apps.apple.com/kr/app/%EC%94%AC%EC%A7%9C%EC%98%A4%EB%B2%A0%ED%8A%B8%EB%82%A8-%EB%A7%A4%EA%B1%B0%EC%A7%84/id6754750793";

  // Actual clean URLs needed for the QR code API
  const gplayCleanUrl = "https://play.google.com/store/search?q=%EC%94%AC%EC%A7%9C%EC%98%A4%EB%B2%A0%ED%8A%B8%EB%82%A8&c=apps&hl=ko";
  const iosCleanUrl = "https://apps.apple.com/kr/app/%EC%94%AC%EC%A7%9C%EC%98%A4%EB%B2%A0%ED%8A%B8%EB%82%A8-%EB%A7%A4%EA%B1%B0%EC%A7%84/id6754750793";

  // QR generated URL using the qrserver API
  const gplayQR = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(gplayCleanUrl)}`;
  const iosQR = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(iosCleanUrl)}`;

  let replaced = false;

  if (desc.includes(gplayHtml)) {
    desc = desc.replace(gplayHtml, `<br/><a href="${gplayCleanUrl}" target="_blank" rel="noopener noreferrer"><img src="${gplayQR}" alt="Google Play QR Code" style="width:120px; height:120px; display:inline-block; border-radius:8px; border:1px solid #ddd; margin-top:5px;" /></a><br/><a href="${gplayCleanUrl}" target="_blank" rel="noopener noreferrer">안드로이드 구글플레이 앱 다운로드 (클릭)</a>`);
    replaced = true;
    console.log("Replaced Google Play HTML link with QR.");
  } else {
    console.log("Could not find exact Google Play string in description.");
  }

  if (desc.includes(iosHtml)) {
    desc = desc.replace(iosHtml, `<br/><a href="${iosCleanUrl}" target="_blank" rel="noopener noreferrer"><img src="${iosQR}" alt="App Store QR Code" style="width:120px; height:120px; display:inline-block; border-radius:8px; border:1px solid #ddd; margin-top:5px;" /></a><br/><a href="${iosCleanUrl}" target="_blank" rel="noopener noreferrer">애플 앱스토어 앱 다운로드 (클릭)</a>`);
    replaced = true;
    console.log("Replaced iOS App Store HTML link with QR.");
  } else {
    console.log("Could not find exact App Store string in description.");
  }

  if (replaced) {
    await prisma.promoCard.update({
      where: { id: card.id },
      data: { description: desc }
    });
    console.log("Successfully updated card 6 with QR codes.");
  }
}

applyQRCodes()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
