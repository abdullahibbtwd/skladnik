import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';

type GroupRow = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { children: number; products: number };
};

export type ProductGroupNode = {
  id: string;
  name: string;
  parentId: string | null;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
  children: ProductGroupNode[];
};

@Injectable()
export class ProductGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    const rows = await this.prisma.productGroup.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { children: true, products: true } } },
    });
    return { groups: this.toTree(rows) };
  }

  async create(user: AuthUser, dto: CreateProductGroupDto) {
    const parentId = dto.parentId ?? null;
    await this.assertParent(user.companyId, null, parentId);
    await this.assertNameFree(user.companyId, parentId, dto.name.trim());

    const group = await this.prisma.productGroup.create({
      data: {
        companyId: user.companyId,
        name: dto.name.trim(),
        parentId,
      },
      include: { _count: { select: { children: true, products: true } } },
    });
    await this.log(user, group.id, 'CREATE', { name: group.name, parentId });
    return { group: this.serialize(group) };
  }

  async update(user: AuthUser, id: string, dto: UpdateProductGroupDto) {
    const existing = await this.findInCompany(user.companyId, id);
    const parentId = dto.parentId === undefined ? existing.parentId : dto.parentId;
    const name = dto.name !== undefined ? dto.name.trim() : existing.name;

    if (dto.parentId !== undefined) {
      await this.assertParent(user.companyId, id, parentId);
    }
    if (name !== existing.name || parentId !== existing.parentId) {
      await this.assertNameFree(user.companyId, parentId, name, id);
    }

    const group = await this.prisma.productGroup.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name } : {}),
        ...(dto.parentId !== undefined ? { parentId } : {}),
      },
      include: { _count: { select: { children: true, products: true } } },
    });
    await this.log(user, group.id, 'UPDATE', { fields: Object.keys(dto) });
    return { group: this.serialize(group) };
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user.companyId, id);
    if (existing._count.children > 0) {
      throw new ConflictException('Move or delete child groups first');
    }
    if (existing._count.products > 0) {
      throw new ConflictException('Move products out of this group first');
    }
    await this.prisma.productGroup.delete({ where: { id: existing.id } });
    await this.log(user, existing.id, 'DELETE', { name: existing.name });
    return { ok: true };
  }

  private async findInCompany(companyId: string, id: string) {
    const group = await this.prisma.productGroup.findFirst({
      where: { id, companyId },
      include: { _count: { select: { children: true, products: true } } },
    });
    if (!group) {
      throw new NotFoundException('Product group not found');
    }
    return group;
  }

  private async assertParent(companyId: string, groupId: string | null, parentId: string | null) {
    if (!parentId) return;
    if (parentId === groupId) {
      throw new BadRequestException('A group cannot be its own parent');
    }
    const parent = await this.prisma.productGroup.findFirst({
      where: { id: parentId, companyId },
      select: { id: true, parentId: true },
    });
    if (!parent) {
      throw new NotFoundException('Parent group not found');
    }
    if (!groupId) return;

    let cursor: string | null = parent.parentId;
    const seen = new Set<string>([parent.id]);
    while (cursor) {
      if (cursor === groupId) {
        throw new BadRequestException('Cannot nest a group under one of its descendants');
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const node: { parentId: string | null } | null = await this.prisma.productGroup.findFirst({
        where: { id: cursor, companyId },
        select: { parentId: true },
      });
      cursor = node?.parentId ?? null;
    }
  }

  private async assertNameFree(companyId: string, parentId: string | null, name: string, excludeId?: string) {
    const clash = await this.prisma.productGroup.findFirst({
      where: {
        companyId,
        parentId,
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('A group with this name already exists here');
    }
  }

  private toTree(rows: GroupRow[]): ProductGroupNode[] {
    const nodes = new Map<string, ProductGroupNode>(
      rows.map((row) => [row.id, { ...this.serialize(row), children: [] }]),
    );
    const roots: ProductGroupNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  private serialize(row: GroupRow): Omit<ProductGroupNode, 'children'> {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      productCount: row._count.products,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async log(user: AuthUser, entityId: string, action: string, metadata: Prisma.InputJsonValue) {
    await this.prisma.activityLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entityType: 'ProductGroup',
        entityId,
        action,
        metadata,
      },
    });
  }
}
