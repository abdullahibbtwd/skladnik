import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Partner, type PartnerKind } from '@prisma/client';
import type { AuthUser } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';

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

  async create(user: AuthUser, dto: CreatePartnerDto) {
    try {
      const partner = await this.prisma.partner.create({
        data: {
          companyId: user.companyId,
          name: dto.name.trim(),
          kind: dto.kind,
          taxId: dto.taxId?.trim() || null,
          address: dto.address?.trim() || null,
          mol: dto.mol?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          bankAccount: dto.bankAccount?.trim() || null,
        },
      });
      await this.log(user, partner.id, 'CREATE', { name: partner.name, kind: partner.kind });
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
    if (dto.taxId !== undefined) data.taxId = dto.taxId?.trim() || null;
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
      await this.log(user, partner.id, 'UPDATE', { fields: Object.keys(dto) });
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
    await this.log(user, existing.id, 'DELETE', { name: existing.name });
    return { ok: true };
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
      throw new ConflictException('A partner with this VAT ID already exists');
    }
  }

  private serialize(partner: Partner) {
    return {
      id: partner.id,
      name: partner.name,
      kind: partner.kind,
      taxId: partner.taxId,
      address: partner.address,
      mol: partner.mol,
      phone: partner.phone,
      email: partner.email,
      bankAccount: partner.bankAccount,
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
    };
  }

  private async log(user: AuthUser, entityId: string, action: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.activityLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entityType: 'Partner',
        entityId,
        action,
        metadata,
      },
    });
  }
}
