import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Platform } from '../auth/decorators/auth-realm.decorator';
import { CurrentPlatformAdmin } from '../platform-auth/decorators/current-platform-admin.decorator';
import type { PlatformAuthUser } from '../platform-auth/platform-auth.types';
import { UpdatePlatformBillingSettingsDto } from './dto/update-platform-billing-settings.dto';
import { PlatformSettingsService } from './platform-settings.service';

@Platform()
@Controller('platform/settings')
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('billing')
  getBilling() {
    return this.settings.getBilling();
  }

  @Patch('billing')
  updateBilling(
    @CurrentPlatformAdmin() admin: PlatformAuthUser,
    @Body() dto: UpdatePlatformBillingSettingsDto,
  ) {
    return this.settings.updateBilling(admin, dto);
  }
}
