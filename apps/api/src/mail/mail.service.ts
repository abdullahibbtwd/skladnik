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
}
