import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, StreamableFile } from '@nestjs/common';
import type { AuthUser } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Annex38SubmittedDto, EShopSettingsDto } from './annex38.dto';
import { Annex38Service } from './annex38.service';

/** Annex 38 e-shop audit files. Company-level filings, so only the owner and the accountant. */
@Controller('annex38')
@Roles('OWNER', 'ACCOUNTANT')
export class Annex38Controller {
  constructor(private readonly annex38: Annex38Service) {}

  @Get('sites')
  sites(@CurrentUser() user: AuthUser) {
    return this.annex38.sites(user);
  }

  @Put('sites/:siteId')
  saveSettings(@CurrentUser() user: AuthUser, @Param('siteId', ParseUUIDPipe) siteId: string, @Body() dto: EShopSettingsDto) {
    return this.annex38.saveSettings(user, siteId, dto);
  }

  @Get('filings')
  archive(@CurrentUser() user: AuthUser) {
    return this.annex38.archive(user);
  }

  @Get('filings/:id/download')
  async download(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const file = await this.annex38.download(user, id);
    return new StreamableFile(file.body, { type: 'application/xml; charset=windows-1251', disposition: `attachment; filename="${file.fileName}"` });
  }

  @Post('filings/:id/submitted')
  markSubmitted(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Annex38SubmittedDto) {
    return this.annex38.markSubmitted(user, id, dto);
  }

  @Get('sites/:siteId/periods/:period')
  view(@CurrentUser() user: AuthUser, @Param('siteId', ParseUUIDPipe) siteId: string, @Param('period') period: string) {
    return this.annex38.view(user, siteId, period);
  }

  @Post('sites/:siteId/periods/:period/filings')
  generate(@CurrentUser() user: AuthUser, @Param('siteId', ParseUUIDPipe) siteId: string, @Param('period') period: string) {
    return this.annex38.generate(user, siteId, period);
  }
}
