/** Shared branded HTML shell for transactional emails (table + inline CSS for clients). */

export const MAIL_BRAND = 'Oborotix';

const TEAL = '#0d9488';
const TEAL_DARK = '#0f766e';
const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const PAGE_BG = '#f1f5f9';
const CARD_BG = '#ffffff';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type MailCta = { label: string; url: string };

export type MailLayoutInput = {
  /** Inbox preview snippet (hidden in body). */
  preheader: string;
  /** Main heading inside the card. */
  heading: string;
  /** Already-escaped or trusted HTML paragraphs/lists. */
  bodyHtml: string;
  cta?: MailCta;
  /** Small note under the CTA (expiry, ignore if unexpected, …). */
  footnoteHtml?: string;
  /** Absolute site origin for footer link, e.g. https://oborotix.com */
  siteUrl?: string;
};

export function renderMailHtml(input: MailLayoutInput): string {
  const preheader = escapeHtml(input.preheader);
  const heading = escapeHtml(input.heading);
  const siteUrl = (input.siteUrl ?? 'https://oborotix.com').replace(/\/$/, '');
  const year = new Date().getFullYear();

  const ctaBlock = input.cta
    ? `
      <tr>
        <td style="padding:8px 0 4px;">
          <a href="${escapeHtml(input.cta.url)}"
             style="display:inline-block;background:${TEAL};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;text-decoration:none;padding:14px 22px;border-radius:10px;border:1px solid ${TEAL_DARK};">
            ${escapeHtml(input.cta.label)}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};word-break:break-all;">
          Or paste this link into your browser:<br />
          <a href="${escapeHtml(input.cta.url)}" style="color:${TEAL};text-decoration:underline;">${escapeHtml(input.cta.url)}</a>
        </td>
      </tr>`
    : '';

  const footnote = input.footnoteHtml
    ? `
      <tr>
        <td style="padding:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:${MUTED};">
          ${input.footnoteHtml}
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${MAIL_BRAND}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${CARD_BG};border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:${TEAL};padding:22px 28px;">
              <img
                src="${escapeHtml(siteUrl)}/oborotix-logo-white.png"
                alt="${MAIL_BRAND}"
                width="180"
                height="53"
                style="display:block;width:180px;height:auto;border:0;outline:none;text-decoration:none;"
              />
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.3;color:${INK};padding-bottom:14px;">
                    ${heading}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK};">
                    ${input.bodyHtml}
                  </td>
                </tr>
                ${ctaBlock}
                ${footnote}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;">
              <div style="border-top:1px solid ${BORDER};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">
                © ${year} ${MAIL_BRAND} · Smart retail &amp; stock management<br />
                <a href="${escapeHtml(siteUrl)}" style="color:${TEAL};text-decoration:none;">${escapeHtml(siteUrl.replace(/^https?:\/\//, ''))}</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Standard body paragraph for mail content. */
export function mailParagraph(html: string): string {
  return `<p style="margin:0 0 14px;">${html}</p>`;
}
