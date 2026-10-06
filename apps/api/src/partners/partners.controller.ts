import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PARTNER_KINDS, type AuthUser, type PartnerKind } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PartnersService } from './partners.service';
import { Tenant } from '../auth/decorators/auth-realm.decorator';

@Tenant()
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  /** Full directory — Owner / Site manager / Accountant only (CASHIER F-05). */
  @Get()
  @Roles('OWNER', 'ACCOUNTANT', 'SITE_MANAGER')
  list(@CurrentUser() user: AuthUser, @Query('kind') kind?: string) {
    const filtered = kind && (PARTNER_KINDS as readonly string[]).includes(kind) ? (kind as PartnerKind) : undefined;
    return this.partners.list(user, filtered);
  }

  /**
   * Lightweight id+name lookup for document entry (Staff included).
   * Product decision: Staff drafts may omit supplier; manager completes before posting.
   */
  @Get('lookup')
  lookup(@CurrentUser() user: AuthUser, @Query('kind') kind?: string, @Query('q') q?: string) {
    const filtered = kind && (PARTNER_KINDS as readonly string[]).includes(kind) ? (kind as PartnerKind) : undefined;
    return this.partners.lookup(user, filtered, q);
  }

  /** Site managers create a supplier from an invoice screen; they still cannot open Partners settings. ACC-01: no Accountant. */
  @Post()
  @Roles('OWNER', 'SITE_MANAGER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePartnerDto) {
    return this.partners.create(user, dto);
  }

  @Patch(':id')
  @Roles('OWNER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
  ) {
    return this.partners.update(user, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.partners.remove(user, id);
  }
}
