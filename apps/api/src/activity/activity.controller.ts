import { Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityQueryDto } from './activity.dto';
import { ActivityService } from './activity.service';

/** Read-only: entries are written by the services that make the changes, never through the API. */
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @Roles('OWNER', 'ACCOUNTANT')
  list(@CurrentUser() user: AuthUser, @Query() query: ActivityQueryDto) {
    return this.activity.list(user, query);
  }
}
