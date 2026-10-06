import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import {
  PLATFORM_ACCESS_COOKIE,
  PLATFORM_JWT_AUDIENCE,
  PLATFORM_JWT_ISSUER,
  PLATFORM_JWT_STRATEGY,
} from '../platform-auth.constants';
import { PrismaService } from '../../prisma/prisma.service';
import type { PlatformAuthUser } from '../platform-auth.types';

type AccessPayload = {
  sub: string;
  aud?: string | string[];
};

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, PLATFORM_JWT_STRATEGY) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.[PLATFORM_ACCESS_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_PLATFORM_ACCESS_SECRET'),
      issuer: PLATFORM_JWT_ISSUER,
      audience: PLATFORM_JWT_AUDIENCE,
    });
  }

  async validate(payload: AccessPayload): Promise<PlatformAuthUser> {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException();
    }
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      totpEnabled: admin.totpEnabled,
    };
  }
}
