import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Partner, type PartnerKind } from '@prisma/client';
import { normaliseEik, normaliseVatNumber, taxIdProblemMessage, taxIdProblems, type AuthUser } from '@skladnik/shared';
import { changes, recordActivity } from '../activity/record-activity';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

const LOGGED_FIELDS = ['name', 'kind', 'eik', 'vatNumber', 'address', 'mol', 'phone', 'email', 'bankAccount'] as const;

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, kind?: PartnerKind) {
    const partners = await this.prisma.partner.findMany({
      where: { companyId: user.companyId, ...(kind ? { kind } : {}) },
      orderBy: { name: 'asc' },
    });
    return { partners: partners.map((partner) => this.serialize(partner)) };
  }

  /** id + name only — safe for Staff document entry (CASHIER F-05 / Section A). */
  async lookup(user: AuthUser, kind?: PartnerKind, q?: string) {
    const search = q?.trim();
    const partners = await this.prisma.partner.findMany({
      where: {
        companyId: user.companyId,
        ...(kind ? { kind } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, kind: true },
      orderBy: { name: 'asc' },
      take: 100,
    });
    return { partners };
  }

  async create(user: AuthUser, dto: CreatePartnerDto) {
    const ids = this.taxIds(dto.eik, dto.vatNumber);
    try {
      const partner = await this.prisma.partner.create({
        data: {
          companyId: user.companyId,
          name: dto.name.trim(),
          kind: dto.kind,
          ...ids,
          address: dto.address?.trim() || null,
          mol: dto.mol?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          bankAccount: dto.bankAccount?.trim() || null,
        },
      });
      await this.log(user, partner, 'CREATE', { before: {}, after: this.snapshot(partner) });
      return { partner: this.serialize(partner) };
    } catch (error) {
      this.throwIfTaxTaken(error);
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdatePartnerDto) {
    const existing = await this.findInCompany(user.companyId, id);
    const data: Prisma.PartnerUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.eik !== undefined || dto.vatNumber !== undefined) {
      Object.assign(
        data,
        this.taxIds(dto.eik !== undefined ? dto.eik : existing.eik, dto.vatNumber !== undefined ? dto.vatNumber : existing.vatNumber),
      );
    }
    if (dto.address !== undefined) data.address = dto.address?.trim() || null;
    if (dto.mol !== undefined) data.mol = dto.mol?.trim() || null;
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.bankAccount !== undefined) data.bankAccount = dto.bankAccount?.trim() || null;

    try {
      const partner = await this.prisma.partner.update({
        where: { id: existing.id },
        data,
      });
      const diff = changes(this.snapshot(existing), this.snapshot(partner));
      if (diff) await this.log(user, partner, 'UPDATE', diff);
      return { partner: this.serialize(partner) };
    } catch (error) {
      this.throwIfTaxTaken(error);
      throw error;
    }
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user.companyId, id);
    const [documents, mappings] = await Promise.all([
      this.prisma.document.count({ where: { partnerId: existing.id } }),
      this.prisma.supplierProductCode.count({ where: { partnerId: existing.id } }),
    ]);
    if (documents > 0 || mappings > 0) {
      throw new ConflictException('This partner is used on documents or product codes');
    }
    await this.prisma.partner.delete({ where: { id: existing.id } });
    await this.log(user, existing, 'DELETE', { before: this.snapshot(existing), after: {} });
    return { ok: true };
  }

  /** Normalised and checksum-checked; a partner is never saved with a number that can't be right. */
  private taxIds(eik: string | null | undefined, vatNumber: string | null | undefined) {
    const ids = {
      eik: eik?.trim() ? normaliseEik(eik) : null,
      vatNumber: vatNumber?.trim() ? normaliseVatNumber(vatNumber) : null,
    };
    const problems = taxIdProblems(ids);
    if (problems.length) throw new BadRequestException(problems.map((problem) => taxIdProblemMessage(problem)).join('. '));
    return ids;
  }

  private async findInCompany(companyId: string, id: string) {
    const partner = await this.prisma.partner.findFirst({ where: { id, companyId } });
    if (!partner) {
      throw new NotFoundException('Partner not found');
    }
    return partner;
  }

  private throwIfTaxTaken(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A partner with this ЕИК already exists');
    }
  }

  private snapshot(partner: Partner) {
    return Object.fromEntries(LOGGED_FIELDS.map((field) => [field, partner[field]]));
  }

  private serialize(partner: Partner) {
    return {
      id: partner.id,
      name: partner.name,
      kind: partner.kind,
      eik: partner.eik,
      vatNumber: partner.vatNumber,
      address: partner.address,
      mol: partner.mol,
      phone: partner.phone,
      email: partner.email,
      bankAccount: partner.bankAccount,
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
    };
  }

  private async log(
    user: AuthUser,
    partner: Partner,
    action: string,
    diff: { before: Record<string, unknown>; after: Record<string, unknown> },
  ) {
    await recordActivity(this.prisma, user, { entityType: 'Partner', entityId: partner.id, action, label: partner.name, ...diff });
  }
}
