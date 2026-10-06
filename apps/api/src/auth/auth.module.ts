import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRealmGuard } from './guards/auth-realm.guard';
import { CompanyScopeGuard } from './guards/company-scope.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AccountantReadOnlyGuard } from './guards/accountant-readonly.guard';
import { RolesGuard } from './guards/roles.guard';
import { SiteAccessGuard } from './guards/site-access.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { InvitesModule } from '../invites/invites.module';
import { SubscriptionGuard } from '../subscriptions/subscription.guard';

@Module({
  imports: [PassportModule, JwtModule.register({}), InvitesModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    SiteAccessGuard,
    // Default-deny realm classification before any JWT check.
    { provide: APP_GUARD, useClass: AuthRealmGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CompanyScopeGuard },
    // ACC-01: after auth/roles so ACCOUNTANT mutations are denied unless allow-listed.
    { provide: APP_GUARD, useClass: AccountantReadOnlyGuard },
    // Shadow by default (SUBSCRIPTION_ENFORCE=true to block). After auth so companyId is present.
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
  exports: [AuthService, SiteAccessGuard],
})
export class AuthModule {}
