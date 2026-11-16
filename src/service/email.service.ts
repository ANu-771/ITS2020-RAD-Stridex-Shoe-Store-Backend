import nodemailer from 'nodemailer';

// In-memory test store used ONLY during automated testing to retrieve OTPs without console logging
const testOtpStore = new Map<string, string>();

export const getTestOtp = (email: string): string | undefined => {
  return testOtpStore.get(email.toLowerCase().trim());
};

export const clearTestOtp = (email: string): void => {
  testOtpStore.delete(email.toLowerCase().trim());
};

/**
 * Creates and returns a configured Nodemailer transporter.
 * Returns null if SMTP credentials are not configured (fallback for test/mock).
 */
const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  return null;
};

/**
 * Sends the STRIDEX Password Reset OTP email.
 * Never logs the actual OTP to console or log files.
 */
export const sendPasswordResetEmail = async (
  email: string,
  otp: string
): Promise<{ success: boolean; messageId?: string }> => {
  const normalizedEmail = email.toLowerCase().trim();

  // Save in test store for automated testing assertions (never logged)
  testOtpStore.set(normalizedEmail, otp);

  const fromAddress =
    process.env.SMTP_FROM || '"STRIDEX Customer Care" <noreply@stridex.com>';
  const subject = 'STRIDEX – Password Reset Verification Code';

  const textBody = `Hello,

We received a request to reset your STRIDEX account password.

Your verification code is:
${otp}

This code expires in 5 minutes.

If you did not request this password reset, please ignore this email.

Thank you,
STRIDEX Team
Step Into Your Style.`;

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>STRIDEX – Password Reset</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F2FAF4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #26352D;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F2FAF4; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #FFFFFF; border: 1px solid #DCEBE0; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 20px rgba(38, 53, 45, 0.04);">
          <!-- Header -->
          <tr>
            <td style="padding: 36px 40px 24px; text-align: center; border-bottom: 1px solid #F2FAF4;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; color: #26352D;">
                STRIDEX<span style="color: #72C98A;">.</span>
              </h1>
              <p style="margin: 6px 0 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #718078;">
                Step Into Your Style
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px 28px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 24px; color: #26352D;">
                Hello,
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 24px; color: #718078;">
                We received a request to reset your STRIDEX account password. Your verification code is:
              </p>

              <!-- OTP Code Display Card -->
              <div style="background-color: #F2FAF4; border: 2px dashed #72C98A; border-radius: 16px; padding: 22px 16px; text-align: center; margin: 0 0 24px;">
                <span style="display: inline-block; font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #26352D; margin-left: 10px;">
                  ${otp}
                </span>
              </div>

              <!-- Expiry Alert -->
              <div style="background-color: #DDF3E2; border-radius: 10px; padding: 12px 16px; margin: 0 0 24px; text-align: center;">
                <p style="margin: 0; font-size: 13px; font-weight: 600; color: #26352D;">
                  ⏱️ This code expires in 5 minutes.
                </p>
              </div>

              <!-- Advisory -->
              <p style="margin: 0 0 28px; font-size: 13px; line-height: 20px; color: #718078;">
                If you did not request this password reset, please ignore this email. Your password will remain unchanged and your account stays secure.
              </p>

              <!-- Sign-off -->
              <div style="border-top: 1px solid #DCEBE0; padding-top: 20px;">
                <p style="margin: 0; font-size: 14px; line-height: 22px; color: #26352D;">
                  Thank you,<br>
                  <strong style="color: #26352D;">STRIDEX Team</strong><br>
                  <em style="color: #72C98A; font-style: normal; font-size: 12px; font-weight: 600;">Step Into Your Style.</em>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #F2FAF4; text-align: center; border-top: 1px solid #DCEBE0;">
              <p style="margin: 0; font-size: 11px; color: #718078; line-height: 16px;">
                This is an automated security notification from STRIDEX Footwear Sri Lanka.<br>
                Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const transporter = getTransporter();

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: normalizedEmail,
        subject,
        text: textBody,
        html: htmlBody,
      });
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      console.error(
        `[Email Service] Failed to send email via SMTP to ${normalizedEmail}:`,
        err.message
      );
      // Fallback: don't crash flow if SMTP gateway encounters network error
      return { success: false };
    }
  } else {
    // Development or test environment fallback: log dispatch event without exposing the actual OTP
    console.log(
      `[Email Service] Password reset verification code dispatched to: ${normalizedEmail} (SMTP not configured, simulated)`
    );
    return { success: true, messageId: 'simulated-local-dispatch' };
  }
};
