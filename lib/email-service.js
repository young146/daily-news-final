import nodemailer from 'nodemailer';

/**
 * Creates a Nodemailer transporter using SMTP credentials from environment variables.
 * Defaults to port 465 (secure) or 587 depending on your SMTP setup.
 */
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', // e.g., smtp.gmail.com
    port: parseInt(process.env.SMTP_PORT || '465'), // 465 for true, 587 for false
    secure: process.env.SMTP_SECURE === 'true' || true,
    auth: {
        user: process.env.SMTP_USER, // e.g., your-email@gmail.com
        pass: process.env.SMTP_PASS, // e.g., your-app-password
    },
});

/**
 * Sends a daily newsletter to an array of subscriber emails.
 *
 * @param {string[]} toEmails Array of recipient email addresses.
 * @param {string} subject The email subject.
 * @param {string} htmlContent The HTML body of the email.
 * @returns {Promise<any>} The result of the send operation.
 */
export async function sendNewsletter(toEmails, subject, htmlContent) {
    if (!toEmails || toEmails.length === 0) {
        console.log('No subscribers to send email to.');
        return;
    }

    // To protect privacy and reduce spam points, we usually use BCC for newsletters,
    // or send individual emails if we need tracking/customization.
    // BCC approach is simpler and avoids exposing the list.
    try {
        const info = await transporter.sendMail({
            from: `"XinChao Daily News" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
            to: [], // BCC handles recipients
            bcc: toEmails.join(','),
            subject: subject,
            html: htmlContent,
        });

        console.log(`Newsletter sent to ${toEmails.length} recipients. Message ID: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('Error sending newsletter:', error);
        throw error;
    }
}
