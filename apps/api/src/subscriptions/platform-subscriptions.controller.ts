import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Platform } from '../auth/decorators/auth-realm.decorator';
import { RateLimit } from '../auth/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';
import { CurrentPlatformAdmin } from '../platform-auth/decorators/current-platform-admin.decorator';
import type { PlatformAuthUser } from '../platform-auth/platform-auth.types';
import { CreatePlatformSubscriptionDto } from './dto/create-platform-subscription.dto';
import { ListPlatformSubscriptionsQueryDto } from './dto/list-platform-subscriptions.dto';
import { MarkInvoicePaidDto } from './dto/mark-invoice-paid.dto';
import { RevealActivationCodeDto } from './dto/reveal-activation-code.dto';
import { TransitionSubscriptionDto } from './dto/transition-subscription.dto';
import { UpdatePlatformSubscriptionDto } from './dto/update-platform-subscription.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import { PlatformSubscriptionsService } from './platform-subscriptions.service';

@Platform()
@Controller('platform/subscriptions')
export class PlatformSubscriptionsController {
  constructor(private readonly subscriptions: PlatformSubscriptionsService) {}

  @Get()
  list(@Query() query: ListPlatformSubscriptionsQueryDto) {
    return this.subscriptions.list(query);
  }

  @Get('stats')
  stats() {
    return this.subscriptions.stats();
  }

  @Post()
  create(
    @CurrentPlatformAdmin() admin: PlatformAuthUser,
    @Body() dto: CreatePlatformSubscriptionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.subscriptions.create(admin, dto, idempotencyKey);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.get(id);
  }

  @Patch(':id')
  update(
    @CurrentPlatformAdmin() admin: PlatformAuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformSubscriptionDto,
  ) {
    return this.subscriptions.update(admin, id, dto);
  }

  @Post(':id/regenerate-code')
  regenerateCode(@CurrentPlatformAdmin() admin: PlatformAuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.regenerateCode(admin, id);
  }

  @Post(':id/transition')
  transition(
    @CurrentPlatformAdmin() admin: PlatformAuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionSubscriptionDto,
  ) {
    return this.subscriptions.transition(admin, id, dto);
  }

  @Post(':id/suspend')
  suspend(@CurrentPlatformAdmin() admin: PlatformAuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.suspend(admin, id);
  }

  @Post(':id/unsuspend')
  unsuspend(@CurrentPlatformAdmin() admin: PlatformAuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.unsuspend(admin, id);
  }

  @Post(':id/revoke')
  revoke(@CurrentPlatformAdmin() admin: PlatformAuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptions.revoke(admin, id);
  }

  @Post(':id/reveal-code')
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'platform-reveal-code', limit: 20, windowSeconds: 15 * 60, by: 'user' })
  async revealCode(
    @CurrentPlatformAdmin() admin: PlatformAuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevealActivationCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.subscriptions.revealCode(admin, id, dto.totpCode);
  }

  @Post(':id/invoices/:invoiceId/mark-paid')
  markInvoicePaid(
    @CurrentPlatformAdmin() admin: PlatformAuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: MarkInvoicePaidDto,
  ) {
    return this.subscriptions.markInvoicePaid(admin, id, invoiceId, dto);
  }

  @Post(':id/invoices/:invoiceId/void')
  voidInvoice(
    @CurrentPlatformAdmin() admin: PlatformAuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: VoidInvoiceDto,
  ) {
    return this.subscriptions.voidInvoice(admin, id, invoiceId, dto);
  }

  @Get(':id/invoices/:invoiceId/pdf')
  async downloadInvoicePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const file = await this.subscriptions.invoicePdf(id, invoiceId);
    return new StreamableFile(file.body, {
      type: 'application/pdf',
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }
}
