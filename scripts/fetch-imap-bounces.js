const imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config();
const prisma = new PrismaClient();

const accounts = [
  { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, label: 'Account 1' },
  { user: process.env.SMTP_USER2, pass: process.env.SMTP_PASS2, label: 'Account 2' },
  { user: process.env.SMTP_USER3, pass: process.env.SMTP_PASS3, label: 'Account 3' },
];

async function processAccount(account, globalBouncedSet) {
  if (!account.user || !account.pass) {
    console.log(`Skipping ${account.label} - credentials not found.`);
    return;
  }
  console.log(`\n===========================================`);
  console.log(`Connecting to IMAP for ${account.label} (${account.user})...`);
  
  const config = {
    imap: {
      user: account.user,
      password: account.pass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };

  let connection;
  try {
    connection = await imap.connect(config);
    await connection.openBox('INBOX');
    console.log(`Connected & INBOX opened for ${account.user}`);

    const sinceDate = new Date();
    // Go back 3 days
    sinceDate.setDate(sinceDate.getDate() - 3);

    const searchCriteria = [
       ['SINCE', sinceDate]
    ];
    
    // Fetch the full body
    const fetchOptions = { bodies: [''], struct: true };
    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`Found ${messages.length} total recent emails for ${account.user}. Filtering for bounces...`);

    let foundBounces = 0;
    
    for (const msg of messages) {
       const part = msg.parts.find(p => p.which === '');
       if (!part) continue;
       
       const parsed = await simpleParser(part.body);
       
       // Check if this is a bounce (Delivery Status Notification)
       const subject = parsed.subject || '';
       const from = parsed.from?.text?.toLowerCase() || '';
       
       if (
           subject.includes('Delivery Status Notification') || 
           subject.includes('Undelivered Mail') || 
           subject.includes('Returned mail') ||
           from.includes('mailer-daemon') ||
           from.includes('postmaster')
       ) {
           foundBounces++;
           
           // We need to extract the original recipient.
           // Usually it's in parsed.text or parsed.attachments.
           const text = parsed.text || '';
           
           // Regex to extract failed email
           // Common Gmail format: "Your message to [email] couldn't be delivered" or "X-Failed-Recipients: [email]"
           // or "Final-Recipient: rfc822; [email]"
           const failedMatch = 
              text.match(/X-Failed-Recipients:\s*([^\s\r\n]+)/i) || 
              text.match(/Final-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i) ||
              text.match(/Your message to\s+([^\s\r\n]+)\s+couldn't be delivered/i) ||
              text.match(/Delivery to the following recipient failed permanently:\s*([^\s\r\n]+)/i) ||
              text.match(/주소([^\s\r\n]+)를 찾을 수 없거나/i) ||
              text.match(/to\s+([^\s\r\n]+)\s+was rejected/i);

           if (failedMatch && failedMatch[1]) {
               let e = failedMatch[1].trim().toLowerCase();
               e = e.replace(/^<|>$/g, ''); // remove brackets if any
               globalBouncedSet.add(e);
           } else {
               // Fallback: look for ANY email in the payload that is NOT the sender and NOT google
               const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g;
               let match;
               let potential = null;
               while ((match = emailRegex.exec(text)) !== null) {
                   const e = match[1].toLowerCase();
                   if (!e.includes('google') && !e.includes('yahoo') && e !== account.user) {
                       potential = e;
                       // Just take the first one that looks like a recipient
                       break;
                   }
               }
               if (potential) globalBouncedSet.add(potential);
           }
       }
    }
    
    console.log(`Parsed ${foundBounces} bounce emails for ${account.label}.`);
    
  } catch (err) {
    console.error(`Error processing ${account.user}:`, err);
  } finally {
    if (connection) connection.end();
  }
}

async function main() {
    console.log("Starting IMAP Bounce Fetch across all 3 sender accounts...");
    const bouncedSet = new Set();
    
    for (const acc of accounts) {
        await processAccount(acc, bouncedSet);
    }
    
    const uniqueBounced = Array.from(bouncedSet);
    console.log(`\n===========================================`);
    console.log(`Total Unique Bounced Emails Found via IMAP: ${uniqueBounced.length}`);
    
    if (uniqueBounced.length > 0) {
        console.log(`Sample: ${uniqueBounced.slice(0, 10).join(', ')}`);
        console.log(`Deactivating in database...`);
        
        const res = await prisma.subscriber.updateMany({
           where: { email: { in: uniqueBounced } },
           data: { isActive: false }
        });
        console.log(`Deactivated ${res.count} subscribers found in Inboxes.`);
    }
    
    const remaining = await prisma.subscriber.count({ where: { isActive: true } });
    console.log(`\nFinal Active Subscriber Count: ${remaining}`);
}
main().catch(console.error).finally(() => prisma.$disconnect());
