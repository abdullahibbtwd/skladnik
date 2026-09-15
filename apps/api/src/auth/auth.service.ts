import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import { isCompanyWideRole, type AuthUser } from '@skladnik/shared';
import * as bcrypt from 'bcrypt';
import type { CookieOptions, Response } from 'express';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  refreshRedisKey,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

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
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: dto.name.trim(),
          role: UserRole.OWNER,
          companyId: company.id,
        },
      });
      await tx.activityLog.create({
        data: {
          companyId: company.id,
          userId: created.id,
          entityType: 'Company',
          entityId: company.id,
          action: 'CREATE',
          metadata: { via: 'signup' },
        },
      });
      return created;
    });

    return this.establishSession(user, res, 'SIGNUP');
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || !user.isActive) {
      return null;
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    return matches ? user : null;
  }

  async login(user: User, res: Response) {
    return this.establishSession(user, res, 'LOGIN');
  }

  async me(authUser: AuthUser): Promise<{ user: SessionUser }> {
    const session = await this.toSessionUser(authUser.id);
    return { user: session };
  }

  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
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

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return this.establishSession(user, res);
  }

  async logout(refreshToken: string | undefined, res: Response) {
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<{ jti?: string }>(refreshToken, {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        });
        if (payload.jti) {
          await this.redis.client.del(refreshRedisKey(payload.jti));
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
        },
      ),
      this.jwt.signAsync(
        { sub: user.id, companyId: user.companyId },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: REFRESH_TTL_SECONDS,
          jwtid: jti,
        },
      ),
    ]);

    await this.ensureRedis();
    await this.redis.client.set(refreshRedisKey(jti), user.id, 'EX', REFRESH_TTL_SECONDS);

    res.cookie(ACCESS_COOKIE, accessToken, this.cookieOptions(ACCESS_TTL_SECONDS * 1000));
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions(REFRESH_TTL_SECONDS * 1000));

    if (activity) {
      await this.prisma.activityLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          entityType: 'User',
          entityId: user.id,
          action: activity,
        },
      });
    }

    return { user: session };
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
