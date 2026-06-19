/**
 * Inline-styled HTML email templates.
 * Email clients strip <style> tags, so every rule lives on the element.
 *
 * Layout: 600px-wide centered table, Inyuku green accent (#0d9488).
 * Pass `appName` at call time — never hardcoded here.
 */

const PRIMARY = '#0d9488';
const TEXT_DARK = '#0f172a';
const TEXT_MUTED = '#64748b';
const BG_PAGE = '#f1f5f9';
const BG_CARD = '#ffffff';
const BORDER = '#e2e8f0';
const FOOTER_TEXT =
  'If you did not request this, please ignore this email.';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(opts: {
  title: string;
  heading: string;
  body: string; // already HTML
  appName: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(opts.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT_DARK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG_PAGE};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${BG_CARD};border:1px solid ${BORDER};border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:${PRIMARY};padding:20px 24px;color:#ffffff;font-size:18px;font-weight:600;">
                ${escapeHtml(opts.appName)}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px 24px;">
                <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:600;color:${TEXT_DARK};line-height:1.3;">
                  ${escapeHtml(opts.heading)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 28px 24px;font-size:15px;line-height:1.6;color:${TEXT_DARK};">
                ${opts.body}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background:${BG_PAGE};border-top:1px solid ${BORDER};font-size:12px;color:${TEXT_MUTED};line-height:1.5;text-align:center;">
                ${escapeHtml(FOOTER_TEXT)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;">
    <tr>
      <td align="center" style="background:${PRIMARY};border-radius:6px;">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;font-family:inherit;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

export function verificationEmailHtml(name: string, verifyLink: string, appName: string): string {
  const body = `
    <p style="margin:0 0 14px 0;">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px 0;">Thank you for registering with ${escapeHtml(appName)}. Please verify your email address by clicking the button below.</p>
    ${button('Verify email', verifyLink)}
    <p style="margin:0 0 8px 0;color:${TEXT_MUTED};font-size:13px;">If the button does not work, copy and paste this link into your browser:</p>
    <p style="margin:0 0 14px 0;word-break:break-all;font-size:13px;"><a href="${escapeHtml(verifyLink)}" style="color:${PRIMARY};">${escapeHtml(verifyLink)}</a></p>
    <p style="margin:0;color:${TEXT_MUTED};font-size:13px;">This link will expire in 24 hours.</p>
  `;
  return shell({
    title: 'Verify your email',
    heading: 'Verify your email address',
    body,
    appName,
  });
}

export function passwordResetEmailHtml(
  name: string,
  resetLink: string,
  appName: string,
): string {
  const body = `
    <p style="margin:0 0 14px 0;">Hello ${escapeHtml(name)},</p>
    <p style="margin:0 0 14px 0;">We received a request to reset the password for your ${escapeHtml(appName)} account. Click the button below to choose a new password.</p>
    ${button('Reset password', resetLink)}
    <p style="margin:0 0 8px 0;color:${TEXT_MUTED};font-size:13px;">If the button does not work, copy and paste this link into your browser:</p>
    <p style="margin:0 0 14px 0;word-break:break-all;font-size:13px;"><a href="${escapeHtml(resetLink)}" style="color:${PRIMARY};">${escapeHtml(resetLink)}</a></p>
    <p style="margin:0;color:${TEXT_MUTED};font-size:13px;">This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
  `;
  return shell({
    title: 'Reset your password',
    heading: 'Reset your password',
    body,
    appName,
  });
}

export function welcomeEmailHtml(name: string, appName: string): string {
  const body = `
    <p style="margin:0 0 14px 0;">Welcome, ${escapeHtml(name)}.</p>
    <p style="margin:0 0 14px 0;">Your account at ${escapeHtml(appName)} has been created. Once your email is verified, you will be able to sign in and start using the platform.</p>
    <p style="margin:0;color:${TEXT_MUTED};font-size:13px;">If you have any questions, please contact support.</p>
  `;
  return shell({
    title: 'Welcome',
    heading: `Welcome to ${appName}`,
    body,
    appName,
  });
}
