import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type UnitAlias } from '@prisma/client';
import type { AuthUser } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitAliasDto } from './dto/create-unit-alias.dto';
import { UpdateUnitAliasDto } from './dto/update-unit-alias.dto';

@Injectable()
export class UnitAliasesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    const aliases = await this.prisma.unitAlias.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ unit: 'asc' }, { raw: 'asc' }],
    });
    return { aliases: aliases.map((alias) => this.serialize(alias)) };
  }

  async create(user: AuthUser, dto: CreateUnitAliasDto) {
    try {
      const alias = await this.prisma.unitAlias.create({
        data: {
          companyId: user.companyId,
          raw: dto.raw.trim(),
          unit: dto.unit,
        },
      });
      await this.log(user, alias.id, 'CREATE', { raw: alias.raw, unit: alias.unit });
      return { alias: this.serialize(alias) };
    } catch (error) {
      this.throwIfTaken(error);
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateUnitAliasDto) {
    const existing = await this.findInCompany(user.companyId, id);
    try {
      const alias = await this.prisma.unitAlias.update({
        where: { id: existing.id },
        data: {
          ...(dto.raw !== undefined ? { raw: dto.raw.trim() } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        },
      });
      await this.log(user, alias.id, 'UPDATE', { fields: Object.keys(dto) });
      return { alias: this.serialize(alias) };
    } catch (error) {
      this.throwIfTaken(error);
      throw error;
    }
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user.companyId, id);
    await this.prisma.unitAlias.delete({ where: { id: existing.id } });
    await this.log(user, existing.id, 'DELETE', { raw: existing.raw });
    return { ok: true };
  }

  private async findInCompany(companyId: string, id: string) {
    const alias = await this.prisma.unitAlias.findFirst({ where: { id, companyId } });
    if (!alias) {
      throw new NotFoundException('Unit alias not found');
    }
    return alias;
  }

  private throwIfTaken(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('That abbreviation is already mapped');
    }
  }

  private serialize(alias: UnitAlias) {
    return {
      id: alias.id,
      raw: alias.raw,
      unit: alias.unit,
      createdAt: alias.createdAt,
      updatedAt: alias.updatedAt,
    };
  }

  private async log(user: AuthUser, entityId: string, action: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.activityLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entityType: 'UnitAlias',
        entityId,
        action,
        metadata,
      },
    });
  }
}
