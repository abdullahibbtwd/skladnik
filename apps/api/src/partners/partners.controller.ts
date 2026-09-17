import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PARTNER_KINDS, type AuthUser, type PartnerKind } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnersService } from './partners.service';

@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('kind') kind?: string) {
    const filtered = kind && (PARTNER_KINDS as readonly string[]).includes(kind) ? (kind as PartnerKind) : undefined;
    return this.partners.list(user, filtered);
  }

  @Post()
  @Roles('OWNER', 'ACCOUNTANT')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePartnerDto) {
    return this.partners.create(user, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ACCOUNTANT')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partners.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ACCOUNTANT')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.partners.remove(user, id);
  }
}
