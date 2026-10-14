import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import {
  MAIL_BRAND,
  escapeHtml,
  mailParagraph,
  renderMailHtml,
} from './mail-layout';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
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

  private async send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    missingLog: string;
    failureLabel: string;
  }): Promise<{ delivered: boolean }> {
    if (!this.transporter) {
      this.logger.warn(`SMTP is not configured. ${input.missingLog}`);
      return { delivered: false };
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      return { delivered: true };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`SMTP failed for ${input.failureLabel} to ${input.to}: ${detail}`);
      throw new BadGatewayException(`Could not send the ${input.failureLabel} email. Try again later.`);
    }
  }
}
