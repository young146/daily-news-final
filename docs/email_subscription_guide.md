# Email Subscription and Sending Directive

## Goal
To manage email subscribers and automatically send daily news digests.

## Tools & Scripts
- **Database Model**: `Subscriber` (email, isActive)
- **Send Script**: `scripts/send-daily-email.js`
- **Email Service**: `lib/email-service.js`

## Execution Flow for Sending Daily Emails
1. The script `scripts/send-daily-email.js` should be run after the daily news publishing process is complete.
2. It fetches all `NewsItem` records published "today".
3. It fetches all `Subscriber` records where `isActive = true`.
4. It constructs an HTML email template containing the top news and other daily news items.
5. It sends the email using the configured email provider (e.g., SMTP via nodemailer).

## Error Handling & Self-Annealing
- **SMTP/Provider Limits**: If the email service has a rate limit or sending limit, catch the error (e.g., max connections per second) and implement a batching mechanism or delay between sends.
- **Update this directive** if new limitations or standard operating procedures are discovered.

## Deliverables
- Sent emails directly to subscribers' inboxes.
- Updated subscriber statuses in the database (e.g., handling bounces or unsubscribe requests).
