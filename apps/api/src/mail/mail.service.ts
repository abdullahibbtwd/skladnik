import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async sendInviteEmail(input: {
    to: string;
    companyName: string;
    roleLabel: string;
    inviterName: string;
    inviteUrl: string;
  }): Promise<{ delivered: boolean }> {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY is not set. Invite URL for ${input.to}: ${input.inviteUrl}`);
      return { delivered: false };
    }

    const from =
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim() || 'Skladnik <beth.t@example.com>';

    const { error } = await this.resend.emails.send({
      from,
      to: input.to,
      subject: `You're invited to join ${input.companyName} on Skladnik`,
      html: `
        <p>Hi,</p>
        <p>${input.inviterName} invited you to join <strong>${input.companyName}</strong> as <strong>${input.roleLabel}</strong>.</p>
        <p><a href="${input.inviteUrl}">Accept the invite and create your account</a></p>
        <p>This link expires in 7 days. If you were not expecting this, you can ignore the email.</p>
      `,
      text: `${input.inviterName} invited you to join ${input.companyName} as ${input.roleLabel}.\n\nAccept the invite: ${input.inviteUrl}\n\nThis link expires in 7 days.`,
    });

    if (error) {
      const detail = typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error);
      this.logger.error(`Resend failed for ${input.to}: ${detail}`);
      throw new BadGatewayException('Could not send the invite email. Try again or copy the invite link.');
    }

    return { delivered: true };
  }

  async sendPasswordResetEmail(input: {
    to: string;
    name: string;
    resetUrl: string;
  }): Promise<{ delivered: boolean }> {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY is not set. Password reset URL for ${input.to}: ${input.resetUrl}`);
      return { delivered: false };
    }

    const from =
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim() || 'Skladnik <beth.t@example.com>';
    const greeting = input.name.trim() || 'there';

    const { error } = await this.resend.emails.send({
      from,
      to: input.to,
      subject: 'Reset your Skladnik password',
      html: `
        <p>Hi ${greeting},</p>
        <p>We received a request to reset the password for your Skladnik account.</p>
        <p><a href="${input.resetUrl}">Choose a new password</a></p>
        <p>This link expires in one hour. If you did not ask for a reset, you can ignore this email.</p>
      `,
      text: `Hi ${greeting},\n\nReset your Skladnik password: ${input.resetUrl}\n\nThis link expires in one hour. If you did not ask for a reset, ignore this email.`,
    });

    if (error) {
      const detail = typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error);
      this.logger.error(`Resend failed for password reset to ${input.to}: ${detail}`);
      throw new BadGatewayException('Could not send the password reset email. Try again later.');
    }

    return { delivered: true };
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
        ? `Skladnik: ${input.companyName} subscription expires tomorrow`
        : `Skladnik: ${input.companyName} subscription expires in ${input.daysBefore} days`;
    const greeting = input.name.trim() || 'there';
    const bodyHtml = `
        <p>Hi ${greeting},</p>
        <p>The Skladnik subscription for <strong>${input.companyName}</strong> expires on <strong>${when}</strong>
        (${input.daysBefore === 1 ? 'tomorrow' : `in ${input.daysBefore} days`}).</p>
        <p>After expiry the workspace stays readable and you can still export data, but writes are blocked until you activate a new code.</p>
        <p><a href="${input.settingsUrl}">Open subscription settings</a></p>
      `;
    const bodyText = `Hi ${greeting},\n\nThe Skladnik subscription for ${input.companyName} expires on ${when} (${input.daysBefore === 1 ? 'tomorrow' : `in ${input.daysBefore} days`}).\n\nOpen settings: ${input.settingsUrl}\n`;

    return this.sendOptional(input.to, subject, bodyHtml, bodyText, 'expiry reminder');
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
    const subject = `Skladnik: ${input.companyName} subscription activated`;
    const bodyHtml = `
        <p>Hi ${greeting},</p>
        <p>A <strong>${input.plan}</strong> subscription for <strong>${input.companyName}</strong> is now active.</p>
        <p>It remains valid until <strong>${when}</strong>.</p>
        <p><a href="${input.settingsUrl}">View subscription details</a></p>
      `;
    const bodyText = `Hi ${greeting},\n\nA ${input.plan} subscription for ${input.companyName} is now active until ${when}.\n\nDetails: ${input.settingsUrl}\n`;

    return this.sendOptional(input.to, subject, bodyHtml, bodyText, 'activation confirmation');
  }

  private async sendOptional(
    to: string,
    subject: string,
    html: string,
    text: string,
    label: string,
  ): Promise<{ delivered: boolean }> {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY is not set. Skipped ${label} email to ${to}: ${subject}`);
      return { delivered: false };
    }

    const from =
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim() || 'Skladnik <beth.t@example.com>';

    const { error } = await this.resend.emails.send({ from, to, subject, html, text });

    if (error) {
      const detail = typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error);
      this.logger.error(`Resend failed for ${label} to ${to}: ${detail}`);
      throw new BadGatewayException(`Could not send the ${label} email. Try again later.`);
    }

    return { delivered: true };
  }
}
