import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CompanyProfileDto,
  DocumentSeriesDto,
  ExpiryWindowsDto,
  PriceOverrideRolesDto,
  PrintTemplateDto,
} from './company.dto';
import { CompanyService } from './company.service';
import { Tenant } from '../auth/decorators/auth-realm.decorator';

/** Company profile and settings. Every role reads them (expiry colours, print layout, till prices). */
@Tenant()
@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  settings(@CurrentUser() user: AuthUser) {
    return this.company.settings(user.companyId);
  }

  @Put('profile')
  @Roles('OWNER')
  saveProfile(@CurrentUser() user: AuthUser, @Body() dto: CompanyProfileDto) {
    return this.company.saveProfile(user, dto);
  }

  @Put('expiry-windows')
  @Roles('OWNER')
  saveExpiryWindows(@CurrentUser() user: AuthUser, @Body() dto: ExpiryWindowsDto) {
    return this.company.saveExpiryWindows(user, dto.windows);
  }

  @Put('print-template')
  @Roles('OWNER')
  savePrintTemplate(@CurrentUser() user: AuthUser, @Body() dto: PrintTemplateDto) {
    return this.company.savePrintTemplate(user, dto);
  }

  /** Who may change prices at the till is the owner's call. */
  @Put('price-override-roles')
  @Roles('OWNER')
  savePriceOverrideRoles(@CurrentUser() user: AuthUser, @Body() dto: PriceOverrideRolesDto) {
    return this.company.savePriceOverrideRoles(user, dto.roles);
  }

  @Put('series/:key')
  @Roles('OWNER')
  saveSeries(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() dto: DocumentSeriesDto) {
    return this.company.saveSeries(user, key, dto);
  }
}
