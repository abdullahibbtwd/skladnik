import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { Tenant } from '../auth/decorators/auth-realm.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { AllowWithoutSubscription } from './decorators/allow-without-subscription.decorator';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { TenantSubscriptionsService } from './tenant-subscriptions.service';

@Tenant()
@Controller('subscriptions')
export class TenantSubscriptionsController {
  constructor(private readonly subscriptions: TenantSubscriptionsService) {}

  @Get('current')
  @AllowWithoutSubscription()
  current(@CurrentUser() user: AuthUser) {
    return this.subscriptions.current(user);
  }

  @Post('activate')
  @AllowWithoutSubscription()
  @Roles('OWNER')
  @UseGuards(RateLimitGuard)
  @RateLimit(
    { name: 'subscription-activate-ip', limit: 30, windowSeconds: 15 * 60, by: 'ip' },
    { name: 'subscription-activate-user', limit: 10, windowSeconds: 15 * 60, by: 'user' },
    { name: 'subscription-activate-company', limit: 20, windowSeconds: 15 * 60, by: 'company' },
  )
  activate(@CurrentUser() user: AuthUser, @Body() dto: ActivateSubscriptionDto) {
    return this.subscriptions.activate(user, dto.code);
  }
}
