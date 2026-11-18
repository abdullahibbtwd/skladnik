import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseAppLocale, type AppLocale } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  createMarketingUnsubscribeToken,
  verifyMarketingUnsubscribeToken,
} from './marketing-unsubscribe-token';
import { renderUnsubscribePage } from './unsubscribe-page';

@Injectable()
export class UnsubscribeService {
  private readonly logger = new Logger(UnsubscribeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  secret(): string {
    return (
      this.config.get<string>('MARKETING_UNSUBSCRIBE_SECRET')?.trim() ||
      this.config.get<string>('JWT_ACCESS_SECRET')?.trim() ||
      ''
    );
  }

  createTokenForUser(userId: string): string {
    return createMarketingUnsubscribeToken(userId, this.secret());
  }

  unsubscribeUrl(userId: string): string {
    const origin = (this.config.get<string>('WEB_ORIGIN') ?? 'https://oborotix.com').replace(/\/$/, '');
    const token = this.createTokenForUser(userId);
    return `${origin}/public/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  async pageForToken(token: string | undefined): Promise<{ status: number; html: string }> {
    const verified = verifyMarketingUnsubscribeToken(token, this.secret());
    if (!verified.ok) {
      return {
        status: 400,
        html: renderUnsubscribePage({
          kind: 'invalid',
          locale: 'en',
          postAction: '/public/unsubscribe',
        }),
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, locale: true, marketingOptOutAt: true },
    });
    if (!user) {
      return {
        status: 400,
        html: renderUnsubscribePage({
          kind: 'invalid',
          locale: 'en',
          postAction: '/public/unsubscribe',
        }),
      };
    }

    const locale = parseAppLocale(user.locale);
    if (user.marketingOptOutAt) {
      return {
        status: 200,
        html: renderUnsubscribePage({
          kind: 'done',
          locale,
          postAction: '/public/unsubscribe',
        }),
      };
    }

    return {
      status: 200,
      html: renderUnsubscribePage({
        kind: 'confirm',
        locale,
        token,
        postAction: '/public/unsubscribe',
      }),
    };
  }

  async optOut(token: string | undefined): Promise<{ status: number; html: string; locale: AppLocale }> {
    const verified = verifyMarketingUnsubscribeToken(token, this.secret());
    if (!verified.ok) {
      this.logger.debug(`Unsubscribe rejected: ${verified.reason}`);
      return {
        status: 400,
        locale: 'en',
        html: renderUnsubscribePage({
          kind: 'invalid',
          locale: 'en',
          postAction: '/public/unsubscribe',
        }),
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, locale: true, marketingOptOutAt: true },
    });
    if (!user) {
      return {
        status: 400,
        locale: 'en',
        html: renderUnsubscribePage({
          kind: 'invalid',
          locale: 'en',
          postAction: '/public/unsubscribe',
        }),
      };
    }

    const locale = parseAppLocale(user.locale);
    if (!user.marketingOptOutAt) {
      await this.prisma.user.updateMany({
        where: { id: user.id, marketingOptOutAt: null },
        data: { marketingOptOutAt: new Date() },
      });
    }

    return {
      status: 200,
      locale,
      html: renderUnsubscribePage({
        kind: 'done',
        locale,
        postAction: '/public/unsubscribe',
      }),
    };
  }
}
