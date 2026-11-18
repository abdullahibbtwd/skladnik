import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppLocale } from '@skladnik/shared';
import nodemailer, { type Transporter } from 'nodemailer';
import {
  MAIL_BRAND,
  escapeHtml,
  mailParagraph,
  marketingUnsubscribeFooterHtml,
  marketingUnsubscribeMailto,
  marketingUnsubscribeTextLine,
  renderMailHtml,
} from './mail-layout';
import { firstScanNudgeCopyForLocale } from './first-scan-nudge-copy';
import { trialEndedCopyForLocale, trialEndingCopyForLocale } from './trial-lifecycle-copy';
import { welcomeCopyForLocale } from './welcome-copy';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly replyTo: string | undefined;
  private readonly siteUrl: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '465');
    const secureFlag = this.config.get<string>('SMTP_SECURE')?.trim().toLowerCase();
    const secure = secureFlag === 'false' ? false : secureFlag === 'true' || port === 465;

    this.from =
      this.config.get<string>('MAIL_FROM')?.trim() ||
      (user ? `${MAIL_BRAND} <${user}>` : `${MAIL_BRAND} <noreply@oborotix.com>`);
    this.replyTo =
      this.config.get<string>('MAIL_REPLY_TO')?.trim() || 'oborotix@oborotix.com';
    this.siteUrl = (this.config.get<string>('WEB_ORIGIN') ?? 'https://oborotix.com').replace(/\/$/, '');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number.isFinite(port) ? port : 465,
        secure,
        auth: { user, pass },
      });
    } else {
      this.transporter = null;
      this.logger.warn('SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS). Emails will be logged only.');
    }
  }

  async sendInviteEmail(input: {
    to: string;
    companyName: string;
    roleLabel: string;
    inviterName: string;
    inviteUrl: string;
  }): Promise<{ delivered: boolean }> {
    const company = escapeHtml(input.companyName);
    const role = escapeHtml(input.roleLabel);
    const inviter = escapeHtml(input.inviterName);

    return this.send({
      to: input.to,
      subject: `You're invited to join ${input.companyName} on ${MAIL_BRAND}`,
      html: renderMailHtml({
        preheader: `${input.inviterName} invited you to join ${input.companyName} on ${MAIL_BRAND}.`,
        heading: "You're invited",
        bodyHtml:
          mailParagraph(`Hi,`) +
          mailParagraph(
            `<strong>${inviter}</strong> invited you to join <strong>${company}</strong> as <strong>${role}</strong>.`,
          ),
        cta: { label: 'Accept invite', url: input.inviteUrl },
        footnoteHtml: 'This link expires in 7 days. If you were not expecting this, you can ignore the email.',
        siteUrl: this.siteUrl,
      }),
      text: `${input.inviterName} invited you to join ${input.companyName} as ${input.roleLabel}.\n\nAccept the invite: ${input.inviteUrl}\n\nThis link expires in 7 days.`,
      missingLog: `Invite URL for ${input.to}: ${input.inviteUrl}`,
      failureLabel: 'invite',
    });
  }

  async sendEmailVerificationCode(input: {
    to: string;
    name: string;
    code: string;
  }): Promise<{ delivered: boolean }> {
    const greeting = escapeHtml(input.name.trim() || 'there');
    const code = escapeHtml(input.code);
    return this.send({
      to: input.to,
      subject: `Your ${MAIL_BRAND} verification code`,
      html: renderMailHtml({
        preheader: `Your verification code is ${input.code}. It expires in 15 minutes.`,
        heading: 'Verify your email',
        bodyHtml:
          mailParagraph(`Hi ${greeting},`) +
          mailParagraph(`Use this code to confirm your email and finish creating your ${MAIL_BRAND} store account.`) +
          `<p style="margin:8px 0 18px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:0.35em;color:#0f172a;">${code}</p>` +
          mailParagraph('The code expires in 15 minutes.'),
        footnoteHtml: 'If you did not create an Oborotix account, you can ignore this email.',
        siteUrl: this.siteUrl,
      }),
      text: `Hi ${input.name.trim() || 'there'},\n\nYour ${MAIL_BRAND} verification code is ${input.code}.\n\nIt expires in 15 minutes. If you did not create an account, ignore this email.\n`,
      missingLog: `Email verification code for ${input.to}: ${input.code}`,
      failureLabel: 'email verification',
    });
  }

  async sendPasswordResetEmail(input: {
    to: string;
    name: string;
    resetUrl: string;
  }): Promise<{ delivered: boolean }> {
    const greeting = escapeHtml(input.name.trim() || 'there');
    return this.send({
      to: input.to,
      subject: `Reset your ${MAIL_BRAND} password`,
      html: renderMailHtml({
        preheader: `Reset your ${MAIL_BRAND} password. This link expires in one hour.`,
        heading: 'Reset your password',
        bodyHtml:
          mailParagraph(`Hi ${greeting},`) +
          mailParagraph(`We received a request to reset the password for your ${MAIL_BRAND} account.`),
        cta: { label: 'Choose a new password', url: input.resetUrl },
        footnoteHtml: 'This link expires in one hour. If you did not ask for a reset, you can ignore this email.',
        siteUrl: this.siteUrl,
      }),
      text: `Hi ${input.name.trim() || 'there'},\n\nReset your ${MAIL_BRAND} password: ${input.resetUrl}\n\nThis link expires in one hour. If you did not ask for a reset, ignore this email.`,
      missingLog: `Password reset URL for ${input.to}: ${input.resetUrl}`,
      failureLabel: 'password reset',
    });
  }

  async sendSubscriptionExpiryReminder(input: {
    to: string;
    name: string;
    companyName: string;
    daysBefore: number;
    expiresAt: Date;
    settingsUrl: string;
  }): Promise<{ delivered: boolean }> {
    const when = input.expiresAt.toISOString().slice(0, 10);
    const subject =
      input.daysBefore === 1
        ? `${MAIL_BRAND}: ${input.companyName} subscription expires tomorrow`
        : `${MAIL_BRAND}: ${input.companyName} subscription expires in ${input.daysBefore} days`;
    const greeting = escapeHtml(input.name.trim() || 'there');
    const company = escapeHtml(input.companyName);
    const timing = input.daysBefore === 1 ? 'tomorrow' : `in ${input.daysBefore} days`;

    return this.send({
      to: input.to,
      subject,
      html: renderMailHtml({
        preheader: `Subscription for ${input.companyName} expires on ${when} (${timing}).`,
        heading: 'Subscription expiring soon',
        bodyHtml:
          mailParagraph(`Hi ${greeting},`) +
          mailParagraph(
            `The ${MAIL_BRAND} subscription for <strong>${company}</strong> expires on <strong>${when}</strong> (${timing}).`,
          ) +
          mailParagraph(
            'After expiry the workspace stays readable and you can still export data, but writes are blocked until you activate a new code.',
          ),
        cta: { label: 'Open subscription settings', url: input.settingsUrl },
        siteUrl: this.siteUrl,
      }),
      text: `Hi ${input.name.trim() || 'there'},\n\nThe ${MAIL_BRAND} subscription for ${input.companyName} expires on ${when} (${timing}).\n\nOpen settings: ${input.settingsUrl}\n`,
      missingLog: `Skipped expiry reminder to ${input.to}: ${subject}`,
      failureLabel: 'expiry reminder',
    });
  }

  async sendSubscriptionActivatedEmail(input: {
    to: string;
    name: string;
    companyName: string;
    plan: string;
    expiresAt: Date;
    settingsUrl: string;
  }): Promise<{ delivered: boolean }> {
    const when = input.expiresAt.toISOString().slice(0, 10);
    const greeting = escapeHtml(input.name.trim() || 'there');
    const company = escapeHtml(input.companyName);
    const plan = escapeHtml(input.plan);
    const subject = `${MAIL_BRAND}: ${input.companyName} subscription activated`;

    return this.send({
      to: input.to,
      subject,
      html: renderMailHtml({
        preheader: `${input.plan} subscription for ${input.companyName} is active until ${when}.`,
        heading: 'Subscription activated',
        bodyHtml:
          mailParagraph(`Hi ${greeting},`) +
          mailParagraph(
            `A <strong>${plan}</strong> subscription for <strong>${company}</strong> is now active.`,
          ) +
          mailParagraph(`It remains valid until <strong>${when}</strong>.`),
        cta: { label: 'View subscription details', url: input.settingsUrl },
        siteUrl: this.siteUrl,
      }),
      text: `Hi ${input.name.trim() || 'there'},\n\nA ${input.plan} subscription for ${input.companyName} is now active until ${when}.\n\nDetails: ${input.settingsUrl}\n`,
      missingLog: `Skipped activation confirmation to ${input.to}: ${subject}`,
      failureLabel: 'activation confirmation',
    });
  }

  /** Internal ops notify for public quote-request leads (QUOTE_NOTIFY_EMAIL). */
  async sendQuoteRequestNotifyEmail(input: {
    to: string;
    quote: {
      id: string;
      name: string;
      businessType: string;
      locations: number;
      contact: string;
      message: string | null;
      locale: string;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      referrer: string | null;
      createdAt: Date;
    };
  }): Promise<{ delivered: boolean; skippedNoSmtp?: boolean }> {
    const q = input.quote;
    const subject = `Oborotix quote request from ${q.name}`;
    const lines = [
      `Name: ${q.name}`,
      `Business: ${q.businessType}`,
      `Locations: ${q.locations}`,
      `Contact: ${q.contact}`,
      `Locale: ${q.locale}`,
      `Message: ${q.message?.trim() || '(none)'}`,
      `UTM: ${[q.utmSource, q.utmMedium, q.utmCampaign].filter(Boolean).join(' / ') || '(none)'}`,
      `Referrer: ${q.referrer || '(none)'}`,
      `Id: ${q.id}`,
      `Created: ${q.createdAt.toISOString()}`,
    ];
    const bodyHtml = lines.map((line) => mailParagraph(escapeHtml(line))).join('');
    const text = lines.join('\n');

    return this.send({
      to: input.to,
      subject,
      html: renderMailHtml({
        preheader: `New quote request from ${q.name}`,
        heading: 'New quote request',
        bodyHtml,
        siteUrl: this.siteUrl,
      }),
      text,
      missingLog: `Quote notify for ${q.id} → ${input.to}`,
      failureLabel: 'quote notify',
      replyTo: this.replyTo,
      allowMissingSmtp: true,
    });
  }

  async sendTrialEndingEmail(input: {
    to: string;
    name: string;
    locale: AppLocale;
    settingsUrl: string;
  }): Promise<{ delivered: boolean; skippedNoSmtp?: boolean }> {
    return this.sendLifecycleCopy({
      copy: trialEndingCopyForLocale(input.locale),
      to: input.to,
      name: input.name,
      locale: input.locale,
      ctaUrl: input.settingsUrl,
      failureLabel: 'trial-ending',
    });
  }

  async sendTrialEndedEmail(input: {
    to: string;
    name: string;
    locale: AppLocale;
    quoteUrl: string;
  }): Promise<{ delivered: boolean; skippedNoSmtp?: boolean }> {
    return this.sendLifecycleCopy({
      copy: trialEndedCopyForLocale(input.locale),
      to: input.to,
      name: input.name,
      locale: input.locale,
      ctaUrl: input.quoteUrl,
      failureLabel: 'trial-ended',
    });
  }

  /** Transactional trial status mail — informational only, no unsubscribe. */
  private async sendLifecycleCopy(input: {
    copy: { subject: string; preheader: string; heading: string; greeting: (n: string) => string; body: string; ctaLabel: string; footnote: string };
    to: string;
    name: string;
    locale: AppLocale;
    ctaUrl: string;
    failureLabel: string;
  }) {
    const displayName = input.name.trim() || (input.locale === 'bg' ? 'колега' : 'there');
    const text =
      `${input.copy.greeting(displayName)}\n\n` +
      `${input.copy.body}\n\n` +
      `${input.copy.ctaLabel}: ${input.ctaUrl}\n`;

    return this.send({
      to: input.to,
      subject: input.copy.subject,
      html: renderMailHtml({
        preheader: input.copy.preheader,
        heading: input.copy.heading,
        bodyHtml:
          mailParagraph(escapeHtml(input.copy.greeting(displayName))) +
          mailParagraph(escapeHtml(input.copy.body)),
        cta: { label: input.copy.ctaLabel, url: input.ctaUrl },
        footnoteHtml: escapeHtml(input.copy.footnote),
        siteUrl: this.siteUrl,
      }),
      text,
      missingLog: `${input.failureLabel} for ${input.to} (locale=${input.locale})`,
      failureLabel: input.failureLabel,
      replyTo: this.replyTo,
      allowMissingSmtp: true,
    });
  }

  /** Marketing tip — includes one-click unsubscribe (https + mailto fallback). */
  async sendFirstScanNudgeEmail(input: {
    to: string;
    name: string;
    locale: AppLocale;
    appUrl: string;
    /** Absolute https unsubscribe confirmation URL (GET shows confirm; POST opts out). */
    unsubscribeUrl: string;
  }): Promise<{ delivered: boolean; skippedNoSmtp?: boolean }> {
    const copy = firstScanNudgeCopyForLocale(input.locale);
    const displayName = input.name.trim() || (input.locale === 'bg' ? 'колега' : 'there');
    const mailto = marketingUnsubscribeMailto(this.replyTo ?? 'oborotix@oborotix.com');
    const footerHtml = marketingUnsubscribeFooterHtml({
      locale: input.locale,
      unsubscribeUrl: input.unsubscribeUrl,
    });
    const footerText = marketingUnsubscribeTextLine({
      locale: input.locale,
      unsubscribeUrl: input.unsubscribeUrl,
    });
    const text =
      `${copy.greeting(displayName)}\n\n` +
      `${copy.body}\n\n` +
      `${copy.ctaLabel}: ${input.appUrl}\n\n` +
      `${footerText}\n`;

    return this.send({
      to: input.to,
      subject: copy.subject,
      html: renderMailHtml({
        preheader: copy.preheader,
        heading: copy.heading,
        bodyHtml:
          mailParagraph(escapeHtml(copy.greeting(displayName))) +
          mailParagraph(escapeHtml(copy.body)),
        cta: { label: copy.ctaLabel, url: input.appUrl },
        footnoteHtml: escapeHtml(copy.footnote),
        siteUrl: this.siteUrl,
        marketingFooterHtml: footerHtml,
      }),
      text,
      missingLog: `First-scan nudge for ${input.to} (locale=${input.locale})`,
      failureLabel: 'first-scan nudge',
      replyTo: this.replyTo,
      allowMissingSmtp: true,
      listUnsubscribeHttps: input.unsubscribeUrl,
      listUnsubscribeMailto: mailto,
    });
  }

  async sendWelcomeEmail(input: {
    to: string;
    name: string;
    companyName: string;
    locale: AppLocale;
    trialEndsAt: Date | null;
    scanUrl: string;
    helpUrl: string;
  }): Promise<{ delivered: boolean; skippedNoSmtp?: boolean }> {
    const copy = welcomeCopyForLocale(input.locale);
    const displayName = input.name.trim() || (input.locale === 'bg' ? 'колега' : 'there');
    const trialDate = input.trialEndsAt
      ? input.trialEndsAt.toISOString().slice(0, 10)
      : input.locale === 'bg'
        ? 'края на пробния период'
        : 'the end of your trial';
    const stepsHtml =
      `<ol style="margin:8px 0 18px;padding-left:22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;">` +
      copy.steps.map((step) => `<li style="margin:0 0 8px;">${escapeHtml(step)}</li>`).join('') +
      `</ol>`;
    const helpHtml =
      mailParagraph(escapeHtml(copy.helpHint)) +
      `<p style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;">` +
      `<a href="${escapeHtml(input.helpUrl)}" style="color:#0d9488;text-decoration:underline;">${escapeHtml(copy.helpLabel)}</a>` +
      `</p>`;

    const textSteps = copy.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
    const text =
      `${copy.greeting(displayName)}\n\n` +
      `${copy.trialLine(trialDate)}\n\n` +
      `${copy.stepsHeading}:\n${textSteps}\n\n` +
      `${copy.ctaLabel}: ${input.scanUrl}\n` +
      `${copy.helpLabel}: ${input.helpUrl}\n`;

    return this.send({
      to: input.to,
      subject: copy.subject,
      html: renderMailHtml({
        preheader: copy.preheader,
        heading: copy.heading,
        bodyHtml:
          mailParagraph(escapeHtml(copy.greeting(displayName))) +
          mailParagraph(escapeHtml(copy.trialLine(trialDate))) +
          mailParagraph(`<strong>${escapeHtml(copy.stepsHeading)}</strong>`) +
          stepsHtml +
          helpHtml,
        cta: { label: copy.ctaLabel, url: input.scanUrl },
        footnoteHtml: escapeHtml(copy.footnote),
        siteUrl: this.siteUrl,
      }),
      text,
      missingLog: `Welcome email for ${input.to} (locale=${input.locale})`,
      failureLabel: 'welcome',
      replyTo: this.replyTo,
      allowMissingSmtp: true,
    });
  }

  private async send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    missingLog: string;
    failureLabel: string;
    replyTo?: string;
    /** When true, missing SMTP returns skippedNoSmtp instead of only delivered:false. */
    allowMissingSmtp?: boolean;
    /** Marketing only: https one-click URL for List-Unsubscribe. */
    listUnsubscribeHttps?: string;
    /** Marketing only: mailto fallback for List-Unsubscribe. */
    listUnsubscribeMailto?: string;
  }): Promise<{ delivered: boolean; skippedNoSmtp?: boolean }> {
    if (!this.transporter) {
      this.logger.warn(`SMTP is not configured. ${input.missingLog}`);
      return input.allowMissingSmtp
        ? { delivered: false, skippedNoSmtp: true }
        : { delivered: false };
    }

    try {
      const listParts = [
        input.listUnsubscribeHttps ? `<${input.listUnsubscribeHttps}>` : null,
        input.listUnsubscribeMailto ? `<${input.listUnsubscribeMailto}>` : null,
      ].filter(Boolean);
      await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        ...(listParts.length
          ? {
              headers: {
                'List-Unsubscribe': listParts.join(', '),
                ...(input.listUnsubscribeHttps
                  ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
                  : {}),
              },
            }
          : {}),
      });
      return { delivered: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`SMTP failed for ${input.failureLabel} to ${input.to}: ${detail}`);
      throw new BadGatewayException(`Could not send the ${input.failureLabel} email. Try again later.`);
    }
  }
}
