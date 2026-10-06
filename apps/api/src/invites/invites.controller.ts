import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public, Tenant } from '../auth/decorators/auth-realm.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InvitesService } from './invites.service';

@Tenant()
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get()
  @Roles('OWNER')
  list(@CurrentUser() user: AuthUser) {
    return this.invites.list(user);
  }

  @Public()
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Post()
  @Roles('OWNER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) {
    return this.invites.create(user, dto);
  }

  @Post(':id/resend')
  @Roles('OWNER')
  resend(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invites.resend(user, id);
  }

  @Post(':id/revoke')
  @Roles('OWNER')
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.invites.revoke(user, id);
  }
}
