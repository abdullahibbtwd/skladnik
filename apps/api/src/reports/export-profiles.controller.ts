import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { SALES_MANAGER_ROLES, type AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AllowWithoutSubscription } from '../subscriptions/decorators/allow-without-subscription.decorator';
import { ExportProfileDto, ExportProfileListQueryDto } from './dto/export-profile.dto';
import { ExportProfilesService } from './export-profiles.service';
import { Tenant } from '../auth/decorators/auth-realm.decorator';

/** Managers export with saved layouts; the owner and the accountant maintain them. */
@Tenant()
@Controller('export-profiles')
export class ExportProfilesController {
  constructor(private readonly profiles: ExportProfilesService) {}

  @Get()
  @Roles(...SALES_MANAGER_ROLES)
  list(@CurrentUser() user: AuthUser, @Query() query: ExportProfileListQueryDto) {
    return this.profiles.list(user, query.reportKind);
  }

  @Post()
  @AllowWithoutSubscription()
  @Roles('OWNER', 'ACCOUNTANT')
  create(@CurrentUser() user: AuthUser, @Body() dto: ExportProfileDto) {
    return this.profiles.create(user, dto);
  }

  @Put(':id')
  @AllowWithoutSubscription()
  @Roles('OWNER', 'ACCOUNTANT')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExportProfileDto) {
    return this.profiles.update(user, id, dto);
  }

  @Delete(':id')
  @AllowWithoutSubscription()
  @Roles('OWNER', 'ACCOUNTANT')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.remove(user, id);
  }
}
