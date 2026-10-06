import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, StreamableFile } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AllowWithoutSubscription } from '../subscriptions/decorators/allow-without-subscription.decorator';
import { VatDocumentTreatmentDto, VatEntryDto, VatExportQueryDto, VatReturnInputsDto, VatSettingsDto, VatSubmittedDto } from './dto/vat.dto';
import { VatService } from './vat.service';
import { Tenant } from '../auth/decorators/auth-realm.decorator';

/** VAT ledgers and return (§4.7b). Company-wide, so only the owner and the accountant. */
@Tenant()
@Controller('vat')
@Roles('OWNER', 'ACCOUNTANT')
export class VatController {
  constructor(private readonly vat: VatService) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.vat.settings(user.companyId);
  }

  @Put('settings')
  @Roles('OWNER')
  saveSettings(@CurrentUser() user: AuthUser, @Body() dto: VatSettingsDto) {
    return this.vat.saveSettings(user, dto);
  }

  @Get('periods/:period')
  period(@CurrentUser() user: AuthUser, @Param('period') period: string) {
    return this.vat.period(user, period);
  }

  @Put('periods/:period/inputs')
  @AllowWithoutSubscription()
  saveInputs(@CurrentUser() user: AuthUser, @Param('period') period: string, @Body() dto: VatReturnInputsDto) {
    return this.vat.saveInputs(user, period, dto);
  }

  @Get('periods/:period/export')
  async export(@CurrentUser() user: AuthUser, @Param('period') period: string, @Query() query: VatExportQueryDto) {
    const file = await this.vat.export(user, period, query);
    return new StreamableFile(file.body, { type: file.contentType, disposition: `attachment; filename="${file.fileName}"` });
  }

  @Post('periods/:period/filings')
  @AllowWithoutSubscription()
  generate(@CurrentUser() user: AuthUser, @Param('period') period: string) {
    return this.vat.generate(user, period);
  }

  @Get('filings/:id/download')
  async download(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const file = await this.vat.download(user, id);
    return new StreamableFile(file.body, { type: 'application/zip', disposition: `attachment; filename="${file.fileName}"` });
  }

  @Post('filings/:id/submitted')
  @AllowWithoutSubscription()
  markSubmitted(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VatSubmittedDto) {
    return this.vat.markSubmitted(user, id, dto);
  }

  @Patch('documents/:id')
  @Roles('OWNER')
  setTreatment(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VatDocumentTreatmentDto) {
    return this.vat.setTreatment(user, id, dto);
  }

  @Post('entries')
  @Roles('OWNER')
  createEntry(@CurrentUser() user: AuthUser, @Body() dto: VatEntryDto) {
    return this.vat.createEntry(user, dto);
  }

  @Put('entries/:id')
  @Roles('OWNER')
  updateEntry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VatEntryDto) {
    return this.vat.updateEntry(user, id, dto);
  }

  @Delete('entries/:id')
  @Roles('OWNER')
  deleteEntry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.vat.deleteEntry(user, id);
  }
}
