import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { isCompanyWideRole, type AuthUser, type UserRole } from '@skladnik/shared';
import {
  PLATFORM_JWT_ISSUER,
  TENANT_JWT_AUDIENCE,
} from '../../platform-auth/platform-auth.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ACCESS_COOKIE } from '../auth.constants';

type AccessPayload = {
  sub: string;
  companyId: string;
  role: UserRole;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.[ACCESS_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      issuer: PLATFORM_JWT_ISSUER,
      audience: TENANT_JWT_AUDIENCE,
    });
  }

  async validate(payload: AccessPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { sites: true },
    });

    if (!user || !user.isActive || user.companyId !== payload.companyId) {
      throw new UnauthorizedException();
    }

    const allSites = isCompanyWideRole(user.role);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      siteIds: allSites ? [] : user.sites.map((row) => row.siteId),
      allSites,
    };
  }
}
