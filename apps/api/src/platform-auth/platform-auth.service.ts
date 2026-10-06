import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  PLATFORM_ACCESS_COOKIE,
  PLATFORM_ACCESS_TTL_SECONDS,
  PLATFORM_JWT_AUDIENCE,
  PLATFORM_JWT_ISSUER,
  PLATFORM_PENDING_COOKIE,
  PLATFORM_PENDING_TTL_SECONDS,
  PLATFORM_REFRESH_COOKIE,
  PLATFORM_REFRESH_TTL_SECONDS,
  platformRefreshRedisKey,
  platformSessionSetKey,
} from './platform-auth.constants';
import type { PlatformAuthUser, PlatformPendingPayload, PlatformPendingPurpose } from './platform-auth.types';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
} from './totp.crypto';

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, res: Response) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (admin.totpEnabled) {
      await this.setPendingCookie(res, admin.id, 'verify');
      return { status: 'TOTP_REQUIRED' as const };
    }

    await this.setPendingCookie(res, admin.id, 'enroll');
    return { status: 'TOTP_ENROLL_REQUIRED' as const };
  }

  async verifyTotp(code: string, pendingToken: string | undefined, res: Response) {
    const pending = await this.requirePending(pendingToken, 'verify');
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: pending.sub } });
    if (!admin.isActive || !admin.totpEnabled || !admin.totpSecret) {
      throw new UnauthorizedException();
    }
    const secret = decryptTotpSecret(admin.totpSecret, this.totpKey());
    if (!verifyTotpCode(code, secret)) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    this.clearPendingCookie(res);
    return this.establishSession(admin.id, res);
  }

  async beginEnroll(pendingToken: string | undefined) {
    const pending = await this.requirePending(pendingToken, 'enroll');
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: pending.sub } });
    if (!admin.isActive) throw new UnauthorizedException();
    if (admin.totpEnabled) {
      throw new ForbiddenException('TOTP is already enabled');
    }

    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, this.totpKey());
    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { totpSecret: encrypted, totpEnabled: false },
    });

    return {
      otpauthUrl: totpKeyUri(admin.email, secret),
      /** Shown once so the admin can enter it manually if QR is unavailable. Never logged. */
      secret,
    };
  }

  async confirmEnroll(code: string, pendingToken: string | undefined, res: Response) {
    const pending = await this.requirePending(pendingToken, 'enroll');
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: pending.sub } });
    if (!admin.isActive || !admin.totpSecret) {
      throw new UnauthorizedException('Start TOTP enrollment first');
    }
    if (admin.totpEnabled) {
      throw new ForbiddenException('TOTP is already enabled');
    }
    const secret = decryptTotpSecret(admin.totpSecret, this.totpKey());
    if (!verifyTotpCode(code, secret)) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { totpEnabled: true },
    });
    this.clearPendingCookie(res);
    return this.establishSession(admin.id, res);
  }

  async me(admin: PlatformAuthUser) {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      totpEnabled: admin.totpEnabled,
    };
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) throw new UnauthorizedException();
    let payload: { sub: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_PLATFORM_REFRESH_SECRET'),
        issuer: PLATFORM_JWT_ISSUER,
        audience: PLATFORM_JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (!payload.jti) throw new UnauthorizedException();

    await this.ensureRedis();
    const stored = await this.redis.client.get(platformRefreshRedisKey(payload.jti));
    if (!stored || stored !== payload.sub) {
      throw new UnauthorizedException();
    }

    await this.redis.client.del(platformRefreshRedisKey(payload.jti));
    await this.redis.client.srem(platformSessionSetKey(payload.sub), payload.jti);

    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.isActive || !admin.totpEnabled) {
      throw new UnauthorizedException();
    }
    return this.establishSession(admin.id, res);
  }

  async logout(refreshToken: string | undefined, res: Response) {
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub?: string; jti?: string }>(refreshToken, {
          secret: this.config.getOrThrow<string>('JWT_PLATFORM_REFRESH_SECRET'),
          issuer: PLATFORM_JWT_ISSUER,
          audience: PLATFORM_JWT_AUDIENCE,
        });
        if (payload.jti) {
          await this.ensureRedis();
          await this.redis.client.del(platformRefreshRedisKey(payload.jti));
          if (payload.sub) {
            await this.redis.client.srem(platformSessionSetKey(payload.sub), payload.jti);
          }
        }
      } catch {
        // Still clear cookies.
      }
    }
    this.clearSessionCookies(res);
    this.clearPendingCookie(res);
    return { ok: true };
  }

  private async establishSession(adminId: string, res: Response) {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: adminId } });
    if (!admin.isActive || !admin.totpEnabled) {
      throw new ForbiddenException('TOTP must be enabled before starting a platform session');
    }

    const jti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: admin.id },
        {
          secret: this.config.getOrThrow<string>('JWT_PLATFORM_ACCESS_SECRET'),
          expiresIn: PLATFORM_ACCESS_TTL_SECONDS,
          issuer: PLATFORM_JWT_ISSUER,
          audience: PLATFORM_JWT_AUDIENCE,
        },
      ),
      this.jwt.signAsync(
        { sub: admin.id },
        {
          secret: this.config.getOrThrow<string>('JWT_PLATFORM_REFRESH_SECRET'),
          expiresIn: PLATFORM_REFRESH_TTL_SECONDS,
          issuer: PLATFORM_JWT_ISSUER,
          audience: PLATFORM_JWT_AUDIENCE,
          jwtid: jti,
        },
      ),
    ]);

    await this.ensureRedis();
    await this.redis.client.set(platformRefreshRedisKey(jti), admin.id, 'EX', PLATFORM_REFRESH_TTL_SECONDS);
    await this.redis.client.sadd(platformSessionSetKey(admin.id), jti);
    await this.redis.client.expire(platformSessionSetKey(admin.id), PLATFORM_REFRESH_TTL_SECONDS);

    res.cookie(PLATFORM_ACCESS_COOKIE, accessToken, this.cookieOptions(PLATFORM_ACCESS_TTL_SECONDS * 1000));
    res.cookie(PLATFORM_REFRESH_COOKIE, refreshToken, this.cookieOptions(PLATFORM_REFRESH_TTL_SECONDS * 1000));

    return {
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        totpEnabled: admin.totpEnabled,
      } satisfies PlatformAuthUser,
    };
  }

  private async setPendingCookie(res: Response, adminId: string, purpose: PlatformPendingPurpose) {
    const token = await this.jwt.signAsync(
      { sub: adminId, purpose } satisfies PlatformPendingPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_PLATFORM_ACCESS_SECRET'),
        expiresIn: PLATFORM_PENDING_TTL_SECONDS,
        issuer: PLATFORM_JWT_ISSUER,
        audience: PLATFORM_JWT_AUDIENCE,
      },
    );
    res.cookie(PLATFORM_PENDING_COOKIE, token, this.cookieOptions(PLATFORM_PENDING_TTL_SECONDS * 1000));
  }

  private async requirePending(
    token: string | undefined,
    purpose: PlatformPendingPurpose,
  ): Promise<PlatformPendingPayload> {
    if (!token) throw new UnauthorizedException();
    let payload: PlatformPendingPayload;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_PLATFORM_ACCESS_SECRET'),
        issuer: PLATFORM_JWT_ISSUER,
        audience: PLATFORM_JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.purpose !== purpose || !payload.sub) {
      throw new UnauthorizedException();
    }
    return payload;
  }

  private totpKey() {
    return this.config.getOrThrow<string>('PLATFORM_TOTP_ENCRYPTION_KEY');
  }

  private cookieOptions(maxAge: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE') === 'true',
      sameSite: 'lax',
      path: '/',
      maxAge,
    };
  }

  private clearSessionCookies(res: Response) {
    const base = this.cookieOptions(0);
    res.clearCookie(PLATFORM_ACCESS_COOKIE, { ...base, maxAge: undefined });
    res.clearCookie(PLATFORM_REFRESH_COOKIE, { ...base, maxAge: undefined });
  }

  private clearPendingCookie(res: Response) {
    const base = this.cookieOptions(0);
    res.clearCookie(PLATFORM_PENDING_COOKIE, { ...base, maxAge: undefined });
  }

  private async ensureRedis() {
    if (this.redis.client.status === 'wait') {
      await this.redis.client.connect();
    }
  }
}
