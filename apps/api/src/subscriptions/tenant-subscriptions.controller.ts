import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { Tenant } from '../auth/decorators/auth-realm.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { SUBSCRIPTION_ACTIVATE_RATE_LIMITS } from './activation-activate.limits';
import { AllowWithoutSubscription } from './decorators/allow-without-subscription.decorator';
import { ActivateSubscriptionDto, PreviewActivationDto } from './dto/activate-subscription.dto';
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

  @Post('activate/preview')
  @AllowWithoutSubscription()
  @Roles('OWNER')
  @UseGuards(RateLimitGuard)
  @RateLimit(...SUBSCRIPTION_ACTIVATE_RATE_LIMITS)
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewActivationDto) {
    return this.subscriptions.preview(user, dto.code);
  }

  @Post('activate')
  @AllowWithoutSubscription()
  @Roles('OWNER')
  @UseGuards(RateLimitGuard)
  @RateLimit(...SUBSCRIPTION_ACTIVATE_RATE_LIMITS)
  activate(@CurrentUser() user: AuthUser, @Body() dto: ActivateSubscriptionDto) {
    return this.subscriptions.activate(user, dto.code, Boolean(dto.confirmEikMismatch));
  }
}
