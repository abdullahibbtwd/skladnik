import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

const BRAND = 'Oborotix';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '465');
    const secureFlag = this.config.get<string>('SMTP_SECURE')?.trim().toLowerCase();
    const secure = secureFlag === 'false' ? false : secureFlag === 'true' || port === 465;

    this.from =
      this.config.get<string>('MAIL_FROM')?.trim() ||
      (user ? `${BRAND} <${user}>` : `${BRAND} <noreply@oborotix.com>`);

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
    return this.send({
      to: input.to,
      subject: `You're invited to join ${input.companyName} on ${BRAND}`,
      html: `
        <p>Hi,</p>
        <p>${input.inviterName} invited you to join <strong>${input.companyName}</strong> as <strong>${input.roleLabel}</strong>.</p>
        <p><a href="${input.inviteUrl}">Accept the invite and create your account</a></p>
        <p>This link expires in 7 days. If you were not expecting this, you can ignore the email.</p>
      `,
      text: `${input.inviterName} invited you to join ${input.companyName} as ${input.roleLabel}.\n\nAccept the invite: ${input.inviteUrl}\n\nThis link expires in 7 days.`,
      missingLog: `Invite URL for ${input.to}: ${input.inviteUrl}`,
      failureLabel: 'invite',
    });
  }

  async sendPasswordResetEmail(input: {
    to: string;
    name: string;
    resetUrl: string;
  }): Promise<{ delivered: boolean }> {
    const greeting = input.name.trim() || 'there';
    return this.send({
      to: input.to,
      subject: `Reset your ${BRAND} password`,
      html: `
        <p>Hi ${greeting},</p>
        <p>We received a request to reset the password for your ${BRAND} account.</p>
        <p><a href="${input.resetUrl}">Choose a new password</a></p>
        <p>This link expires in one hour. If you did not ask for a reset, you can ignore this email.</p>
      `,
      text: `Hi ${greeting},\n\nReset your ${BRAND} password: ${input.resetUrl}\n\nThis link expires in one hour. If you did not ask for a reset, ignore this email.`,
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
        ? `${BRAND}: ${input.companyName} subscription expires tomorrow`
        : `${BRAND}: ${input.companyName} subscription expires in ${input.daysBefore} days`;
    const greeting = input.name.trim() || 'there';
    const bodyHtml = `
        <p>Hi ${greeting},</p>
        <p>The ${BRAND} subscription for <strong>${input.companyName}</strong> expires on <strong>${when}</strong>
        (${input.daysBefore === 1 ? 'tomorrow' : `in ${input.daysBefore} days`}).</p>
        <p>After expiry the workspace stays readable and you can still export data, but writes are blocked until you activate a new code.</p>
        <p><a href="${input.settingsUrl}">Open subscription settings</a></p>
      `;
    const bodyText = `Hi ${greeting},\n\nThe ${BRAND} subscription for ${input.companyName} expires on ${when} (${input.daysBefore === 1 ? 'tomorrow' : `in ${input.daysBefore} days`}).\n\nOpen settings: ${input.settingsUrl}\n`;

    return this.send({
      to: input.to,
      subject,
      html: bodyHtml,
      text: bodyText,
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
    const greeting = input.name.trim() || 'there';
    const subject = `${BRAND}: ${input.companyName} subscription activated`;
    const bodyHtml = `
        <p>Hi ${greeting},</p>
        <p>A <strong>${input.plan}</strong> subscription for <strong>${input.companyName}</strong> is now active.</p>
        <p>It remains valid until <strong>${when}</strong>.</p>
        <p><a href="${input.settingsUrl}">View subscription details</a></p>
      `;
    const bodyText = `Hi ${greeting},\n\nA ${input.plan} subscription for ${input.companyName} is now active until ${when}.\n\nDetails: ${input.settingsUrl}\n`;

    return this.send({
      to: input.to,
      subject,
      html: bodyHtml,
      text: bodyText,
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
