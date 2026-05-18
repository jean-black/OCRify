require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// OCRify brand purple
const BRAND = '#667eea';

function buildEmail(bodyContent) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a202c;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:40px auto;padding:0 20px;">
    <tr>
      <td>

        <!-- Header -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #1a202c;padding-bottom:20px;margin-bottom:32px;">
          <tr>
            <td>
              <span style="font-size:26px;font-weight:700;color:#1a202c;letter-spacing:-0.5px;">
                OCR<span style="color:${BRAND};">ify</span>
              </span>
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:15px;line-height:1.8;color:#2d3748;">
              ${bodyContent}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;margin-top:40px;padding-top:20px;">
          <tr>
            <td style="font-size:12px;color:#a0aec0;text-align:center;">
              OCRify &mdash; Extract Text from Images Instantly<br>
              Jean Claude &middot; Near East University
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Welcome email sent on registration
async function sendWelcomeEmail(toEmail, username) {
    const body = `
        <p>Hello <strong style="color:${BRAND};">${username}</strong>,</p>
        <p>Welcome to <strong style="color:${BRAND};">OCRify</strong>.</p>
        <p>Your account has been created successfully. You can now upload images and extract text instantly.</p>
        <p style="margin-top:28px;color:#718096;font-size:13px;">If you did not create this account, you can safely ignore this message.</p>
    `;

    await transporter.sendMail({
        from: `"OCRify" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'Welcome to OCRify',
        html: buildEmail(body)
    });
}

// Password reset email with recovery code
async function sendResetEmail(toEmail, username, code) {
    const body = `
        <p>Hello <strong style="color:${BRAND};">${username}</strong>,</p>
        <p>We received a request to reset your <strong style="color:${BRAND};">OCRify</strong> password.</p>
        <p>Your recovery code is:</p>
        <p style="margin:24px 0;text-align:center;">
            <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:10px;color:#1a202c;background:#f7fafc;border:2px solid #e2e8f0;border-radius:10px;padding:14px 28px;">
                <span style="color:${BRAND};">${code}</span>
            </span>
        </p>
        <p>This code expires in <strong>15 minutes</strong>. Enter it on the recovery page to set a new password.</p>
        <p style="margin-top:28px;color:#718096;font-size:13px;">If you did not request a password reset, you can safely ignore this message.</p>
    `;

    await transporter.sendMail({
        from: `"OCRify" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'OCRify — Password Recovery Code',
        html: buildEmail(body)
    });
}

module.exports = { sendWelcomeEmail, sendResetEmail };
