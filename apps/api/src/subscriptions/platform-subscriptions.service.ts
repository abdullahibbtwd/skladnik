import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type ActivationCode,
  type Invoice,
  type Subscription,
  type SubscriptionEventType,
  type SubscriptionStatus,
} from '@prisma/client';
import { canTransitionInvoiceStatus, canTransitionSubscriptionStatus, computeInvoiceTotals } from '@skladnik/shared';
import { randomUUID } from 'crypto';
import { decryptTotpSecret, verifyTotpTimestep } from '../platform-auth/totp.crypto';
import type { PlatformAuthUser } from '../platform-auth/platform-auth.types';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { encryptActivationCode, decryptActivationCode } from './activation-code.crypto';
import { issueActivationCode } from './activation-code';
import { CreatePlatformSubscriptionDto } from './dto/create-platform-subscription.dto';
import { ListPlatformSubscriptionsQueryDto } from './dto/list-platform-subscriptions.dto';
import { MarkInvoicePaidDto } from './dto/mark-invoice-paid.dto';
import { TransitionSubscriptionDto } from './dto/transition-subscription.dto';
import { UpdatePlatformSubscriptionDto } from './dto/update-platform-subscription.dto';
import { VoidInvoiceDto } from './dto/void-invoice.dto';
import { takeInvoiceNumber } from './invoice-number';
import { renderInvoicePdf } from './invoice-pdf';

const DEFAULT_INVOICE_TITLE = 'Proforma invoice';
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const REVEAL_FAIL_WINDOW_SECONDS = 15 * 60;
const REVEAL_FAIL_LIMIT = 5;
const REVEAL_LOCKOUT_SECONDS = 15 * 60;
const TOTP_REPLAY_TTL_SECONDS = 120;

const subscriptionInclude = {
  company: { select: { id: true, name: true, eik: true } },
  activationCodes: {
    orderBy: { createdAt: 'desc' as const },
    take: 5,
    select: {
      id: true,
      codePrefix: true,
      expiresAt: true,
      redeemedAt: true,
      revokedAt: true,
      createdAt: true,
      codeCiphertext: true,
    },
  },
  invoices: {
    orderBy: { issuedAt: 'desc' as const },
    take: 10,
  },
  events: {
    orderBy: { createdAt: 'desc' as const },
    take: 30,
  },
} as const;

@Injectable()
export class PlatformSubscriptionsService {
  private readonly logger = new Logger(PlatformSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async list(query: ListPlatformSubscriptionsQueryDto) {
    const where: Prisma.SubscriptionWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.plan) where.plan = query.plan;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { companyNameHint: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
        { externalInvoiceRef: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { company: { name: { contains: q, mode: 'insensitive' } } },
        { activationCodes: { some: { codePrefix: { startsWith: q.toUpperCase() } } } },
      ];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, eik: true } },
          activationCodes: {
            where: { redeemedAt: null, revokedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, codePrefix: true, expiresAt: true, createdAt: true, codeCiphertext: true },
          },
          invoices: {
            orderBy: { issuedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              number: true,
              status: true,
              totalMinor: true,
              currency: true,
              issuedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      subscriptions: rows.map((row) => this.serializeListItem(row)),
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async stats() {
    const [statusGroups, invoiceGroups, paidSum] = await Promise.all([
      this.prisma.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { totalMinor: true },
      }),
    ]);

    const byStatus = Object.fromEntries(statusGroups.map((row) => [row.status, row._count._all])) as Partial<
      Record<SubscriptionStatus, number>
    >;
    const byInvoice = Object.fromEntries(invoiceGroups.map((row) => [row.status, row._count._all])) as Partial<
      Record<'ISSUED' | 'PAID' | 'VOID', number>
    >;

    const pending = byStatus.PENDING ?? 0;
    const active = byStatus.ACTIVE ?? 0;
    const trial = byStatus.TRIAL ?? 0;
    const suspended = byStatus.SUSPENDED ?? 0;
    const expired = byStatus.EXPIRED ?? 0;
    const revoked = byStatus.REVOKED ?? 0;

    return {
      total: pending + active + trial + suspended + expired + revoked,
      pending,
      active,
      trial,
      suspended,
      expired,
      revoked,
      issuedInvoices: byInvoice.ISSUED ?? 0,
      paidInvoices: byInvoice.PAID ?? 0,
      voidInvoices: byInvoice.VOID ?? 0,
      totalPaidMinor: paidSum._sum.totalMinor ?? 0,
    };
  }

  async get(id: string) {
    const row = await this.findOrThrow(id);
    return { subscription: this.serializeDetail(row) };
  }

  async create(
    admin: PlatformAuthUser,
    dto: CreatePlatformSubscriptionDto,
    idempotencyKey?: string | null,
  ) {
    const key = idempotencyKey?.trim();
    if (key) {
      const cached = await this.readIdempotentResponse(admin.id, key);
      if (cached) return cached;
      const claimed = await this.claimIdempotency(admin.id, key);
      if (!claimed) {
        const again = await this.readIdempotentResponse(admin.id, key);
        if (again) return again;
        throw new ConflictException('Idempotent request already in progress');
      }
    }

    try {
      const seller = await this.platformSettings.requireSeller();
      const issued = issueActivationCode(this.pepper());
      const codeId = randomUUID();
      const ciphertext = encryptActivationCode(issued.plaintext, this.codeKey(), codeId);
      const now = new Date();
      const totals = computeInvoiceTotals(dto.priceMinor, dto.vatRate);
      const title = dto.invoiceTitle?.trim() || DEFAULT_INVOICE_TITLE;
      const lineItems = [
        {
          description: `${dto.plan} · ${dto.termMonths} month(s) · ${dto.maxUsers} user(s)`,
          quantity: 1,
          unitMinor: dto.priceMinor,
          lineMinor: dto.priceMinor,
        },
      ];

      const result = await this.prisma.$transaction(async (tx) => {
        const subscription = await tx.subscription.create({
          data: {
            plan: dto.plan,
            status: 'PENDING',
            maxUsers: dto.maxUsers,
            termMonths: dto.termMonths,
            companyNameHint: dto.companyNameHint?.trim() || null,
            contactEmail: dto.contactEmail?.trim().toLowerCase() || null,
            notes: dto.notes?.trim() || null,
            externalInvoiceRef: dto.externalInvoiceRef?.trim() || null,
            createdByAdminId: admin.id,
          },
        });

        await tx.activationCode.create({
          data: {
            id: codeId,
            subscriptionId: subscription.id,
            codeHash: issued.codeHash,
            codePrefix: issued.codePrefix,
            codeCiphertext: ciphertext,
            expiresAt: issued.expiresAt,
          },
        });

        const number = await takeInvoiceNumber(tx, now);
        const invoice = await tx.invoice.create({
          data: {
            subscriptionId: subscription.id,
            number,
            title,
            status: 'ISSUED',
            currency: dto.currency.toUpperCase(),
            vatRate: new Prisma.Decimal(dto.vatRate),
            subtotalMinor: totals.subtotalMinor,
            vatMinor: totals.vatMinor,
            totalMinor: totals.totalMinor,
            lineItems,
            ...seller,
            buyerName: dto.buyerName.trim(),
            buyerEik: dto.buyerEik.trim(),
            buyerAddress: dto.buyerAddress.trim(),
            buyerEmail: dto.buyerEmail.trim().toLowerCase(),
            issuedAt: now,
          },
        });

        await this.writeEvent(tx, {
          subscriptionId: subscription.id,
          type: 'CREATED',
          toStatus: 'PENDING',
          actorId: admin.id,
          payload: {
            plan: dto.plan,
            maxUsers: dto.maxUsers,
            termMonths: dto.termMonths,
            codePrefix: issued.codePrefix,
          },
        });
        await this.writeEvent(tx, {
          subscriptionId: subscription.id,
          type: 'CODE_ISSUED',
          actorId: admin.id,
          payload: { codePrefix: issued.codePrefix, expiresAt: issued.expiresAt.toISOString() },
        });
        await this.writeEvent(tx, {
          subscriptionId: subscription.id,
          type: 'INVOICE_CREATED',
          actorId: admin.id,
          payload: {
            invoiceId: invoice.id,
            number: invoice.number,
            totalMinor: invoice.totalMinor,
            currency: invoice.currency,
            status: invoice.status,
          },
        });

        await this.writeAudit(tx, admin.id, 'SUBSCRIPTION_CREATE', subscription.id, {
          after: {
            plan: dto.plan,
            maxUsers: dto.maxUsers,
            termMonths: dto.termMonths,
            codePrefix: issued.codePrefix,
            invoiceNumber: invoice.number,
          },
        });

        return { subscriptionId: subscription.id, invoiceId: invoice.id };
      });

      const detail = await this.findOrThrow(result.subscriptionId);
      const response = {
        subscription: this.serializeDetail(detail),
        /** Plaintext shown once — never persisted in logs. Ciphertext stored for later reveal. */
        activationCode: issued.plaintext,
        invoiceId: result.invoiceId,
      };

      if (key) await this.storeIdempotentResponse(admin.id, key, response);
      return response;
    } catch (error) {
      if (key) await this.releaseIdempotencyClaim(admin.id, key);
      throw error;
    }
  }

  async update(admin: PlatformAuthUser, id: string, dto: UpdatePlatformSubscriptionDto) {
    const existing = await this.findOrThrow(id);
    if (existing.status === 'REVOKED') {
      throw new BadRequestException('Cannot edit a revoked subscription');
    }

    const data: Prisma.SubscriptionUpdateInput = {};
    if (dto.plan !== undefined) data.plan = dto.plan;
    if (dto.maxUsers !== undefined) data.maxUsers = dto.maxUsers;
    if (dto.termMonths !== undefined) data.termMonths = dto.termMonths;
    if (dto.companyNameHint !== undefined) data.companyNameHint = dto.companyNameHint?.trim() || null;
    if (dto.contactEmail !== undefined) {
      data.contactEmail = dto.contactEmail?.trim().toLowerCase() || null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.externalInvoiceRef !== undefined) {
      data.externalInvoiceRef = dto.externalInvoiceRef?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return { subscription: this.serializeDetail(existing) };
    }

    data.version = { increment: 1 };

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({ where: { id }, data });
      const limitsChanged =
        dto.plan !== undefined || dto.maxUsers !== undefined || dto.termMonths !== undefined;
      await this.writeEvent(tx, {
        subscriptionId: id,
        type: limitsChanged ? 'LIMITS_CHANGED' : 'NOTE',
        actorId: admin.id,
        payload: { ...dto },
      });
      await this.writeAudit(tx, admin.id, 'SUBSCRIPTION_UPDATE', id, {
        before: this.snapshot(existing),
        after: dto,
      });
    });

    return { subscription: this.serializeDetail(await this.findOrThrow(id)) };
  }

  async regenerateCode(admin: PlatformAuthUser, id: string) {
    const existing = await this.findOrThrow(id);
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('Only pending subscriptions can get a new activation code');
    }

    const issued = issueActivationCode(this.pepper());
    const codeId = randomUUID();
    const ciphertext = encryptActivationCode(issued.plaintext, this.codeKey(), codeId);

    await this.prisma.$transaction(async (tx) => {
      const active = await tx.activationCode.findMany({
        where: { subscriptionId: id, revokedAt: null, redeemedAt: null },
      });
      const now = new Date();
      for (const code of active) {
        await tx.activationCode.update({
          where: { id: code.id },
          data: { revokedAt: now, codeCiphertext: null },
        });
        await this.writeEvent(tx, {
          subscriptionId: id,
          type: 'CODE_REVOKED',
          actorId: admin.id,
          payload: { codePrefix: code.codePrefix, reason: 'regenerate' },
        });
      }

      await tx.activationCode.create({
        data: {
          id: codeId,
          subscriptionId: id,
          codeHash: issued.codeHash,
          codePrefix: issued.codePrefix,
          codeCiphertext: ciphertext,
          expiresAt: issued.expiresAt,
        },
      });
      await tx.subscription.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await this.writeEvent(tx, {
        subscriptionId: id,
        type: 'CODE_ISSUED',
        actorId: admin.id,
        payload: { codePrefix: issued.codePrefix, expiresAt: issued.expiresAt.toISOString() },
      });
      await this.writeAudit(tx, admin.id, 'SUBSCRIPTION_REGENERATE_CODE', id, {
        after: { codePrefix: issued.codePrefix },
      });
    });

    return {
      subscription: this.serializeDetail(await this.findOrThrow(id)),
      activationCode: issued.plaintext,
    };
  }

  async transition(admin: PlatformAuthUser, id: string, dto: TransitionSubscriptionDto) {
    const toStatus = dto.toStatus;
    if ((toStatus === 'SUSPENDED' || toStatus === 'REVOKED') && !dto.reason?.trim()) {
      throw new BadRequestException(`reason is required when transitioning to ${toStatus}`);
    }

    const existing = await this.findOrThrow(id);
    if (existing.version !== dto.version) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'VERSION_CONFLICT',
        message: 'Subscription version mismatch',
        subscription: this.serializeDetail(existing),
      });
    }
    if (!canTransitionSubscriptionStatus(existing.status, toStatus)) {
      throw new BadRequestException(`Cannot change status from ${existing.status} to ${toStatus}`);
    }

    const auditAction =
      toStatus === 'SUSPENDED'
        ? 'SUBSCRIPTION_SUSPEND'
        : toStatus === 'REVOKED'
          ? 'SUBSCRIPTION_REVOKE'
          : toStatus === 'ACTIVE' && existing.status === 'SUSPENDED'
            ? 'SUBSCRIPTION_UNSUSPEND'
            : 'SUBSCRIPTION_TRANSITION';

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.updateMany({
        where: { id, version: dto.version },
        data: { status: toStatus, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: 'VERSION_CONFLICT',
          message: 'Subscription version mismatch',
        });
      }

      if (toStatus === 'REVOKED') {
        const openCodes = await tx.activationCode.findMany({
          where: { subscriptionId: id, revokedAt: null, redeemedAt: null },
        });
        const now = new Date();
        for (const code of openCodes) {
          await tx.activationCode.update({
            where: { id: code.id },
            data: { revokedAt: now, codeCiphertext: null },
          });
          await this.writeEvent(tx, {
            subscriptionId: id,
            type: 'CODE_REVOKED',
            actorId: admin.id,
            payload: { codePrefix: code.codePrefix, reason: 'subscription_revoked' },
          });
        }
        await tx.activationCode.updateMany({
          where: { subscriptionId: id, codeCiphertext: { not: null } },
          data: { codeCiphertext: null },
        });
      }

      await this.writeEvent(tx, {
        subscriptionId: id,
        type: 'STATUS_CHANGED',
        fromStatus: existing.status,
        toStatus,
        actorId: admin.id,
        payload: dto.reason?.trim() ? { reason: dto.reason.trim() } : undefined,
      });
      await this.writeAudit(tx, admin.id, auditAction, id, {
        before: { status: existing.status, version: existing.version },
        after: { status: toStatus, reason: dto.reason?.trim() || null },
      });
    });

    return { subscription: this.serializeDetail(await this.findOrThrow(id)) };
  }

  /** Legacy thin delegate — prefer POST :id/transition. */
  async suspend(admin: PlatformAuthUser, id: string) {
    const existing = await this.findOrThrow(id);
    return this.transition(admin, id, {
      toStatus: 'SUSPENDED',
      reason: 'suspended via legacy endpoint',
      version: existing.version,
    });
  }

  /** Legacy thin delegate — prefer POST :id/transition. */
  async unsuspend(admin: PlatformAuthUser, id: string) {
    const existing = await this.findOrThrow(id);
    if (existing.status !== 'SUSPENDED') {
      throw new BadRequestException('Only suspended subscriptions can be unsuspended');
    }
    return this.transition(admin, id, {
      toStatus: 'ACTIVE',
      version: existing.version,
    });
  }

  /** Legacy thin delegate — prefer POST :id/transition. */
  async revoke(admin: PlatformAuthUser, id: string) {
    const existing = await this.findOrThrow(id);
    return this.transition(admin, id, {
      toStatus: 'REVOKED',
      reason: 'revoked via legacy endpoint',
      version: existing.version,
    });
  }

  async revealCode(admin: PlatformAuthUser, id: string, totpCode: string) {
    await this.ensureRedis();
    await this.assertRevealNotLocked(admin.id);

    const adminRow = await this.prisma.platformAdmin.findUnique({ where: { id: admin.id } });
    if (!adminRow?.isActive || !adminRow.totpEnabled || !adminRow.totpSecret) {
      throw new UnauthorizedException('TOTP is required to reveal activation codes');
    }

    const secret = decryptTotpSecret(adminRow.totpSecret, this.totpKey());
    const timestep = verifyTotpTimestep(totpCode, secret);
    if (timestep === null) {
      await this.recordRevealFailure(admin.id, id);
      throw new UnauthorizedException('Invalid authentication code');
    }

    const replayKey = `platform:totp-used:${admin.id}:${timestep}`;
    const replaySet = await this.redis.client.set(replayKey, '1', 'EX', TOTP_REPLAY_TTL_SECONDS, 'NX');
    if (replaySet !== 'OK') {
      await this.recordRevealFailure(admin.id, id);
      throw new UnauthorizedException('Authentication code already used');
    }

    const subscription = await this.findOrThrow(id);
    if (subscription.status !== 'PENDING') {
      throw new GoneException('Activation code is only available while the subscription is PENDING');
    }

    const open = subscription.activationCodes.find(
      (c) => !c.redeemedAt && !c.revokedAt && c.expiresAt.getTime() > Date.now(),
    );
    if (!open) {
      throw new NotFoundException('No revealable activation code');
    }

    const full = await this.prisma.activationCode.findUnique({ where: { id: open.id } });
    if (!full?.codeCiphertext) {
      throw new GoneException('Activation code ciphertext is no longer available');
    }

    let plaintext: string;
    try {
      plaintext = decryptActivationCode(full.codeCiphertext, this.codeKey(), full.id);
    } catch {
      this.logger.error(`Failed to decrypt activation code id=${full.id}`);
      throw new ServiceUnavailableException('Could not decrypt activation code');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.writeEvent(tx, {
        subscriptionId: id,
        type: 'CODE_REVEALED',
        actorId: admin.id,
        payload: { codePrefix: full.codePrefix, activationCodeId: full.id },
      });
      await this.writeAudit(tx, admin.id, 'SUBSCRIPTION_CODE_REVEAL', id, {
        after: { codePrefix: full.codePrefix, activationCodeId: full.id },
      });
    });

    await this.clearRevealFailures(admin.id);

    return { activationCode: plaintext, codePrefix: full.codePrefix, expiresAt: full.expiresAt };
  }

  async markInvoicePaid(
    admin: PlatformAuthUser,
    subscriptionId: string,
    invoiceId: string,
    dto: MarkInvoicePaidDto,
  ) {
    const invoice = await this.requireInvoice(subscriptionId, invoiceId);
    if (!canTransitionInvoiceStatus(invoice.status, 'PAID')) {
      throw new BadRequestException(`Cannot mark invoice ${invoice.status} as PAID`);
    }

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    const paidAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt,
          version: { increment: 1 },
        },
      });
      await this.writeEvent(tx, {
        subscriptionId,
        type: 'INVOICE_PAID',
        actorId: admin.id,
        payload: {
          invoiceId: invoice.id,
          number: invoice.number,
          paymentReference: dto.paymentReference.trim(),
          paymentDate: paymentDate.toISOString(),
        },
      });
      await this.writeAudit(tx, admin.id, 'INVOICE_MARK_PAID', invoice.id, {
        before: { status: invoice.status },
        after: {
          status: 'PAID',
          paymentReference: dto.paymentReference.trim(),
          paymentDate: paymentDate.toISOString(),
        },
      });
    });

    return { subscription: this.serializeDetail(await this.findOrThrow(subscriptionId)) };
  }

  async voidInvoice(
    admin: PlatformAuthUser,
    subscriptionId: string,
    invoiceId: string,
    dto: VoidInvoiceDto,
  ) {
    const invoice = await this.requireInvoice(subscriptionId, invoiceId);
    if (!canTransitionInvoiceStatus(invoice.status, 'VOID')) {
      throw new BadRequestException(`Cannot void invoice in status ${invoice.status}`);
    }

    const voidedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'VOID',
          voidedAt,
          version: { increment: 1 },
        },
      });
      await this.writeEvent(tx, {
        subscriptionId,
        type: 'INVOICE_VOIDED',
        actorId: admin.id,
        payload: {
          invoiceId: invoice.id,
          number: invoice.number,
          reason: dto.reason?.trim() || null,
        },
      });
      await this.writeAudit(tx, admin.id, 'INVOICE_VOID', invoice.id, {
        before: { status: invoice.status },
        after: { status: 'VOID', reason: dto.reason?.trim() || null },
      });
    });

    return { subscription: this.serializeDetail(await this.findOrThrow(subscriptionId)) };
  }

  async invoicePdf(subscriptionId: string, invoiceId: string): Promise<{ body: Buffer; fileName: string }> {
    const invoice = await this.requireInvoice(subscriptionId, invoiceId);
    const lineItems = invoice.lineItems as InvoicePdfLineItems;
    const body = await renderInvoicePdf({
      number: invoice.number,
      title: invoice.title,
      currency: invoice.currency,
      vatRate: Number(invoice.vatRate),
      subtotalMinor: invoice.subtotalMinor,
      vatMinor: invoice.vatMinor,
      totalMinor: invoice.totalMinor,
      issuedAt: invoice.issuedAt,
      sellerName: invoice.sellerName,
      sellerEik: invoice.sellerEik,
      sellerAddress: invoice.sellerAddress,
      sellerEmail: invoice.sellerEmail,
      buyerName: invoice.buyerName,
      buyerEik: invoice.buyerEik,
      buyerAddress: invoice.buyerAddress,
      buyerEmail: invoice.buyerEmail,
      lineItems: Array.isArray(lineItems) ? lineItems : [],
    });
    return { body, fileName: `${invoice.number}.pdf` };
  }

  /** Cron: wipe ciphertext for expired or non-PENDING codes. */
  async sweepStaleCiphertexts(now = new Date()) {
    const result = await this.prisma.activationCode.updateMany({
      where: {
        codeCiphertext: { not: null },
        OR: [
          { expiresAt: { lte: now } },
          { redeemedAt: { not: null } },
          { revokedAt: { not: null } },
          { subscription: { status: { not: 'PENDING' } } },
        ],
      },
      data: { codeCiphertext: null },
    });
    if (result.count > 0) {
      this.logger.log(`Cleared ciphertext on ${result.count} activation code(s)`);
    }
    return result.count;
  }

  private async requireInvoice(subscriptionId: string, invoiceId: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, subscriptionId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.subscription.findUnique({
      where: { id },
      include: subscriptionInclude,
    });
    if (!row) throw new NotFoundException('Subscription not found');
    return row;
  }

  private pepper() {
    return this.config.getOrThrow<string>('ACTIVATION_CODE_PEPPER');
  }

  private codeKey() {
    return this.config.getOrThrow<string>('ACTIVATION_CODE_ENCRYPTION_KEY');
  }

  private totpKey() {
    return this.config.getOrThrow<string>('PLATFORM_TOTP_ENCRYPTION_KEY');
  }

  private idempotencyRedisKey(adminId: string, key: string) {
    return `platform:idempotency:sub-create:${adminId}:${key}`;
  }

  private async ensureRedis() {
    if (this.redis.client.status === 'wait') {
      await this.redis.client.connect();
    }
  }

  private async claimIdempotency(adminId: string, key: string): Promise<boolean> {
    await this.ensureRedis();
    const result = await this.redis.client.set(
      this.idempotencyRedisKey(adminId, key),
      JSON.stringify({ status: 'pending' }),
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  private async storeIdempotentResponse(adminId: string, key: string, response: unknown) {
    await this.ensureRedis();
    await this.redis.client.set(
      this.idempotencyRedisKey(adminId, key),
      JSON.stringify({ status: 'done', response }),
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
    );
  }

  private async releaseIdempotencyClaim(adminId: string, key: string) {
    await this.ensureRedis();
    const raw = await this.redis.client.get(this.idempotencyRedisKey(adminId, key));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { status?: string };
      if (parsed.status === 'pending') {
        await this.redis.client.del(this.idempotencyRedisKey(adminId, key));
      }
    } catch {
      /* ignore */
    }
  }

  private async readIdempotentResponse(adminId: string, key: string): Promise<unknown | null> {
    await this.ensureRedis();
    const raw = await this.redis.client.get(this.idempotencyRedisKey(adminId, key));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { status?: string; response?: unknown };
      if (parsed.status === 'done') return parsed.response ?? null;
      return null;
    } catch {
      return null;
    }
  }

  private revealFailKey(adminId: string) {
    return `platform:reveal-fail:${adminId}`;
  }

  private revealLockKey(adminId: string) {
    return `platform:reveal-lock:${adminId}`;
  }

  private async assertRevealNotLocked(adminId: string) {
    const locked = await this.redis.client.get(this.revealLockKey(adminId));
    if (locked) {
      throw new UnauthorizedException('Too many failed reveal attempts. Try again later.');
    }
  }

  private async recordRevealFailure(adminId: string, subscriptionId: string) {
    const count = await this.redis.client.incr(this.revealFailKey(adminId));
    if (count === 1) {
      await this.redis.client.expire(this.revealFailKey(adminId), REVEAL_FAIL_WINDOW_SECONDS);
    }
    await this.prisma.platformAuditLog.create({
      data: {
        adminId,
        action: 'SUBSCRIPTION_CODE_REVEAL_FAILED',
        entityType: 'Subscription',
        entityId: subscriptionId,
        after: { failures: count },
      },
    });
    if (count >= REVEAL_FAIL_LIMIT) {
      await this.redis.client.set(this.revealLockKey(adminId), '1', 'EX', REVEAL_LOCKOUT_SECONDS);
    }
  }

  private async clearRevealFailures(adminId: string) {
    await this.redis.client.del(this.revealFailKey(adminId), this.revealLockKey(adminId));
  }

  private async writeEvent(
    tx: Prisma.TransactionClient,
    input: {
      subscriptionId: string;
      type: SubscriptionEventType;
      fromStatus?: SubscriptionStatus;
      toStatus?: SubscriptionStatus;
      actorId: string;
      payload?: Prisma.InputJsonValue;
    },
  ) {
    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: input.subscriptionId,
        type: input.type,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorType: 'PLATFORM_ADMIN',
        actorId: input.actorId,
        payload: input.payload ?? Prisma.JsonNull,
      },
    });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    adminId: string,
    action: string,
    entityId: string,
    diff: { before?: unknown; after?: unknown },
  ) {
    await tx.platformAuditLog.create({
      data: {
        adminId,
        action,
        entityType: 'Subscription',
        entityId,
        before: (diff.before as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        after: (diff.after as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  private snapshot(row: Subscription) {
    return {
      plan: row.plan,
      status: row.status,
      maxUsers: row.maxUsers,
      termMonths: row.termMonths,
      companyNameHint: row.companyNameHint,
      contactEmail: row.contactEmail,
      notes: row.notes,
      externalInvoiceRef: row.externalInvoiceRef,
      version: row.version,
    };
  }

  private serializeInvoiceSummary(invoice: Invoice) {
    return {
      id: invoice.id,
      number: invoice.number,
      title: invoice.title,
      status: invoice.status,
      currency: invoice.currency,
      vatRate: Number(invoice.vatRate),
      subtotalMinor: invoice.subtotalMinor,
      vatMinor: invoice.vatMinor,
      totalMinor: invoice.totalMinor,
      issuedAt: invoice.issuedAt,
      paidAt: invoice.paidAt,
      voidedAt: invoice.voidedAt,
      version: invoice.version,
    };
  }

  private serializeListItem(
    row: Subscription & {
      company: { id: string; name: string; eik: string | null } | null;
      activationCodes: {
        id: string;
        codePrefix: string;
        expiresAt: Date;
        createdAt: Date;
        codeCiphertext: string | null;
      }[];
      invoices: Array<{
        id: string;
        number: string;
        status: Invoice['status'];
        totalMinor: number;
        currency: string;
        issuedAt: Date;
      }>;
    },
  ) {
    const openCode = row.activationCodes[0] ?? null;
    const latestInvoice = row.invoices[0] ?? null;
    return {
      id: row.id,
      plan: row.plan,
      status: row.status,
      maxUsers: row.maxUsers,
      termMonths: row.termMonths,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      companyNameHint: row.companyNameHint,
      contactEmail: row.contactEmail,
      externalInvoiceRef: row.externalInvoiceRef,
      version: row.version,
      company: row.company,
      openCodePrefix: openCode?.codePrefix ?? null,
      openCodeExpiresAt: openCode?.expiresAt ?? null,
      codeRevealable: Boolean(openCode?.codeCiphertext) && row.status === 'PENDING',
      latestInvoice: latestInvoice
        ? {
            id: latestInvoice.id,
            number: latestInvoice.number,
            status: latestInvoice.status,
            totalMinor: latestInvoice.totalMinor,
            currency: latestInvoice.currency,
            issuedAt: latestInvoice.issuedAt,
          }
        : null,
      activatedAt: row.activatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private serializeDetail(
    row: Subscription & {
      company: { id: string; name: string; eik: string | null } | null;
      activationCodes: Array<
        Pick<
          ActivationCode,
          'id' | 'codePrefix' | 'expiresAt' | 'redeemedAt' | 'revokedAt' | 'createdAt' | 'codeCiphertext'
        >
      >;
      invoices: Invoice[];
      events: {
        id: string;
        type: SubscriptionEventType;
        fromStatus: SubscriptionStatus | null;
        toStatus: SubscriptionStatus | null;
        actorType: string;
        actorId: string | null;
        payload: Prisma.JsonValue;
        createdAt: Date;
      }[];
    },
  ) {
    const latestInvoice = row.invoices[0] ?? null;
    return {
      id: row.id,
      plan: row.plan,
      status: row.status,
      maxUsers: row.maxUsers,
      termMonths: row.termMonths,
      startsAt: row.startsAt,
      expiresAt: row.expiresAt,
      companyNameHint: row.companyNameHint,
      contactEmail: row.contactEmail,
      notes: row.notes,
      externalInvoiceRef: row.externalInvoiceRef,
      version: row.version,
      company: row.company,
      activatedAt: row.activatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      latestInvoice: latestInvoice ? this.serializeInvoiceSummary(latestInvoice) : null,
      invoices: row.invoices.map((inv) => this.serializeInvoiceSummary(inv)),
      activationCodes: row.activationCodes.map((code) => ({
        id: code.id,
        codePrefix: code.codePrefix,
        expiresAt: code.expiresAt,
        redeemedAt: code.redeemedAt,
        revokedAt: code.revokedAt,
        createdAt: code.createdAt,
        revealable: Boolean(code.codeCiphertext) && !code.redeemedAt && !code.revokedAt,
      })),
      events: row.events.map((event) => ({
        id: event.id,
        type: event.type,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorType: event.actorType,
        actorId: event.actorId,
        payload: event.payload,
        createdAt: event.createdAt,
      })),
    };
  }
}

type InvoicePdfLineItems = Array<{
  description: string;
  quantity: number;
  unitMinor: number;
  lineMinor: number;
}>;
