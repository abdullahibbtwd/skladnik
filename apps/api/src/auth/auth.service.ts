import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { isCompanyWideRole, type AuthUser } from '@skladnik/shared';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import type { CookieOptions, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { recordActivity } from '../activity/record-activity';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { seedUnitAliases } from '../units/seed-unit-aliases';
import {
  PLATFORM_JWT_ISSUER,
  TENANT_JWT_AUDIENCE,
} from '../platform-auth/platform-auth.constants';
import { createSignupTrialSubscription } from '../subscriptions/create-signup-trial';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  RESET_TTL_SECONDS,
  refreshRedisKey,
  resetRedisKey,
  sessionSetKey,
} from './auth.constants';
import { SignupDto } from './dto/signup.dto';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  siteIds: string[];
  allSites: boolean;
};

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  providers() {
    const googleClientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() || null;
    return { googleClientId };
  }

  async signup(dto: SignupDto, res: Response) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: dto.companyName.trim() },
      });
      await seedUnitAliases(tx, company.id);
      await createSignupTrialSubscription(tx, company.id);
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: dto.name.trim(),
          role: UserRole.OWNER,
          companyId: company.id,
        },
      });
      await recordActivity(tx, { ...created, companyId: company.id }, {
        entityType: 'Company',
        entityId: company.id,
        label: company.name,
        action: 'CREATE',
        metadata: { via: 'signup' },
      });
      return created;
    });

    return this.establishSession(user, res, 'SIGNUP');
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || !user.isActive || !user.passwordHash) {
      return null;
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    return matches ? user : null;
  }

  async login(user: User, res: Response) {
    return this.establishSession(user, res, 'LOGIN');
  }

  async issueSession(user: User, res: Response, activity?: 'LOGIN' | 'SIGNUP') {
    return this.establishSession(user, res, activity);
  }

  async me(authUser: AuthUser): Promise<{ user: SessionUser }> {
    const session = await this.toSessionUser(authUser.id);
    return { user: session };
  }

  async forgotPassword(emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always look the same to callers so we never confirm whether an email is registered.
    const opaque = { ok: true as const };

    if (!user || !user.isActive) {
      return opaque;
    }

    await this.ensureRedis();
    const token = randomBytes(32).toString('hex');
    await this.redis.client.set(resetRedisKey(token), user.id, 'EX', RESET_TTL_SECONDS);

    const origin = (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5176').replace(/\/$/, '');
    const resetUrl = `${origin}/reset-password?token=${token}`;

    let delivered = false;
    try {
      ({ delivered } = await this.mail.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
      }));
    } catch (error) {
      // Keep the token so a logged URL / non-prod resetUrl still works; only production surfaces the mail failure.
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw error;
      }
    }

    if (this.config.get<string>('NODE_ENV') !== 'production') {
      return { ...opaque, delivered, resetUrl };
    }

    return { ...opaque, delivered };
  }

  async resetPassword(token: string, password: string, res: Response) {
    await this.ensureRedis();
    const userId = await this.redis.client.get(resetRedisKey(token));
    if (!userId) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      await this.redis.client.del(resetRedisKey(token));
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await this.redis.client.del(resetRedisKey(token));
    await this.revokeAllSessions(user.id);
    this.clearCookies(res);

    await recordActivity(this.prisma, user, {
      entityType: 'User',
      entityId: user.id,
      label: user.name || user.email,
      action: 'UPDATE',
      metadata: { via: 'password-reset' },
    });

    return { ok: true };
  }

  async loginWithGoogle(credential: string, res: Response) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new BadRequestException('Google sign-in is not configured');
    }

    const ticket = await this.getGoogleClient(clientId).verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google sign-in could not be verified');
    }

    const email = payload.email.trim().toLowerCase();
    const googleSub = payload.sub;
    const name = (payload.name || payload.given_name || email.split('@')[0] || 'User').trim().slice(0, 120);

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleSub }, { email }] },
    });

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('This account is disabled');
      }
      if (user.googleSub && user.googleSub !== googleSub) {
        throw new UnauthorizedException('Google sign-in could not be verified');
      }
      if (!user.googleSub) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleSub },
        });
      }
      return this.establishSession(user, res, 'LOGIN');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const companyName = `${name}'s store`.slice(0, 160);
      const company = await tx.company.create({ data: { name: companyName } });
      await seedUnitAliases(tx, company.id);
      await createSignupTrialSubscription(tx, company.id);
      const owner = await tx.user.create({
        data: {
          email,
          name,
          googleSub,
          passwordHash: null,
          role: UserRole.OWNER,
          companyId: company.id,
        },
      });
      await recordActivity(tx, { ...owner, companyId: company.id }, {
        entityType: 'Company',
        entityId: company.id,
        label: company.name,
        action: 'CREATE',
        metadata: { via: 'google-signup' },
      });
      return owner;
    });

    return this.establishSession(created, res, 'SIGNUP');
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        issuer: PLATFORM_JWT_ISSUER,
        audience: TENANT_JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.redis.client.get(refreshRedisKey(payload.jti));
    if (!stored || stored !== payload.sub) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    await this.redis.client.del(refreshRedisKey(payload.jti));
    await this.redis.client.srem(sessionSetKey(payload.sub), payload.jti);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return this.establishSession(user, res);
  }

  async logout(refreshToken: string | undefined, res: Response) {
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub?: string; jti?: string }>(refreshToken, {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          issuer: PLATFORM_JWT_ISSUER,
          audience: TENANT_JWT_AUDIENCE,
        });
        if (payload.jti) {
          await this.redis.client.del(refreshRedisKey(payload.jti));
          if (payload.sub) {
            await this.redis.client.srem(sessionSetKey(payload.sub), payload.jti);
          }
        }
      } catch {
        // Cookie may already be expired; still clear the browser state.
      }
    }

    this.clearCookies(res);
    return { ok: true };
  }

  private async establishSession(user: User, res: Response, activity?: 'LOGIN' | 'SIGNUP') {
    const session = await this.toSessionUser(user.id);
    const jti = randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, companyId: user.companyId, role: user.role },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: ACCESS_TTL_SECONDS,
          issuer: PLATFORM_JWT_ISSUER,
          audience: TENANT_JWT_AUDIENCE,
        },
      ),
      this.jwt.signAsync(
        { sub: user.id, companyId: user.companyId },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: REFRESH_TTL_SECONDS,
          issuer: PLATFORM_JWT_ISSUER,
          audience: TENANT_JWT_AUDIENCE,
          jwtid: jti,
        },
      ),
    ]);

    await this.ensureRedis();
    await this.redis.client.set(refreshRedisKey(jti), user.id, 'EX', REFRESH_TTL_SECONDS);
    await this.redis.client.sadd(sessionSetKey(user.id), jti);
    await this.redis.client.expire(sessionSetKey(user.id), REFRESH_TTL_SECONDS);

    res.cookie(ACCESS_COOKIE, accessToken, this.cookieOptions(ACCESS_TTL_SECONDS * 1000));
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions(REFRESH_TTL_SECONDS * 1000));

    if (activity) {
      await recordActivity(this.prisma, user, {
        entityType: 'User',
        entityId: user.id,
        label: user.name || user.email,
        action: activity,
      });
    }

    return { user: session };
  }

  private async revokeAllSessions(userId: string) {
    await this.ensureRedis();
    const jtis = await this.redis.client.smembers(sessionSetKey(userId));
    if (jtis.length > 0) {
      const pipeline = this.redis.client.pipeline();
      for (const jti of jtis) {
        pipeline.del(refreshRedisKey(jti));
      }
      pipeline.del(sessionSetKey(userId));
      await pipeline.exec();
    } else {
      await this.redis.client.del(sessionSetKey(userId));
    }
  }

  private getGoogleClient(clientId: string) {
    this.googleClient ??= new OAuth2Client(clientId);
    return this.googleClient;
  }

  private async toSessionUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { company: true, sites: true },
    });
    const allSites = isCompanyWideRole(user.role);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: user.company.name,
      siteIds: allSites ? [] : user.sites.map((row) => row.siteId),
      allSites,
    };
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

  private clearCookies(res: Response) {
    const base = this.cookieOptions(0);
    res.clearCookie(ACCESS_COOKIE, { ...base, maxAge: undefined });
    res.clearCookie(REFRESH_COOKIE, { ...base, maxAge: undefined });
  }

  private async ensureRedis() {
    if (this.redis.client.status === 'wait') {
      await this.redis.client.connect();
    }
  }
}
