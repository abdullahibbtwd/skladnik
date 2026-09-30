import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Site } from '@prisma/client';
import type { AuthUser } from '@skladnik/shared';
import { changes, recordActivity } from '../activity/record-activity';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

const siteInclude = {
  manager: { select: { id: true, name: true, email: true, isActive: true } },
  eShop: { select: { siteId: true } },
} as const;

function siteSnapshot(site: Site & { manager: { name: string } | null }) {
  return { name: site.name, type: site.type, address: site.address, manager: site.manager?.name ?? null, isActive: site.isActive };
}

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    const where: Prisma.SiteWhereInput = user.allSites
      ? { companyId: user.companyId }
      : { companyId: user.companyId, isActive: true, id: { in: user.siteIds } };

    const sites = await this.prisma.site.findMany({
      where,
      include: siteInclude,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return { sites: sites.map((site) => this.serialize(site)) };
  }

  /** Any active site of the company can receive a transfer, including ones the user isn't assigned to. */
  async transferTargets(user: AuthUser) {
    const sites = await this.prisma.site.findMany({
      where: { companyId: user.companyId, isActive: true },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
    return { sites };
  }

  async get(user: AuthUser, id: string) {
    const site = await this.findInCompany(user.companyId, id);
    this.assertCanView(user, site);
    return { site: this.serialize(site) };
  }

  async create(user: AuthUser, dto: CreateSiteDto) {
    await this.assertManager(user.companyId, dto.managerUserId);

    try {
      const site = await this.prisma.site.create({
        data: {
          companyId: user.companyId,
          name: dto.name.trim(),
          type: dto.type,
          address: dto.address?.trim() || null,
          managerUserId: dto.managerUserId ?? null,
        },
        include: siteInclude,
      });

      await this.log(user, { id: site.id, label: site.name }, 'CREATE', { after: siteSnapshot(site) });
      return { site: this.serialize(site) };
    } catch (error) {
      this.throwIfNameTaken(error);
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateSiteDto) {
    const existing = await this.findInCompany(user.companyId, id);
    await this.assertManager(user.companyId, dto.managerUserId);

    const data: Prisma.SiteUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.address !== undefined) data.address = dto.address.trim() || null;
    if (dto.managerUserId !== undefined) {
      data.manager = dto.managerUserId
        ? { connect: { id: dto.managerUserId } }
        : { disconnect: true };
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      data.deactivatedAt = dto.isActive ? null : new Date();
    }

    try {
      const site = await this.prisma.site.update({
        where: { id: existing.id },
        data,
        include: siteInclude,
      });
      const diff = changes(siteSnapshot(existing), siteSnapshot(site));
      if (diff) await this.log(user, { id: site.id, label: site.name }, 'UPDATE', diff);
      return { site: this.serialize(site) };
    } catch (error) {
      this.throwIfNameTaken(error);
      throw error;
    }
  }

  async deactivate(user: AuthUser, id: string) {
    const existing = await this.findInCompany(user.companyId, id);
    if (!existing.isActive) {
      return { site: this.serialize(existing) };
    }

    const site = await this.prisma.site.update({
      where: { id: existing.id },
      data: { isActive: false, deactivatedAt: new Date() },
      include: siteInclude,
    });
    await this.log(user, { id: site.id, label: site.name }, 'DEACTIVATE', { before: { isActive: true }, after: { isActive: false } });
    return { site: this.serialize(site) };
  }

  private async findInCompany(companyId: string, id: string) {
    const site = await this.prisma.site.findFirst({
      where: { id, companyId },
      include: siteInclude,
    });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }

  private assertCanView(user: AuthUser, site: { id: string; isActive: boolean }) {
    if (user.allSites) return;
    if (!site.isActive || !user.siteIds.includes(site.id)) {
      throw new ForbiddenException('Site is outside your assigned locations');
    }
  }

  private async assertManager(companyId: string, managerUserId?: string | null) {
    if (!managerUserId) return;
    const manager = await this.prisma.user.findFirst({
      where: { id: managerUserId, companyId, isActive: true },
      select: { id: true },
    });
    if (!manager) {
      throw new NotFoundException('Person in charge must be an active user in this company');
    }
  }

  private throwIfNameTaken(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A site with this name already exists');
    }
  }

  private serialize(site: Site & { manager: { id: string; name: string; email: string; isActive: boolean } | null; eShop?: { siteId: string } | null }) {
    return {
      id: site.id,
      name: site.name,
      type: site.type,
      address: site.address,
      isActive: site.isActive,
      deactivatedAt: site.deactivatedAt,
      manager: site.manager,
      /** Registered as an e-shop (Annex 38): the till asks for card transaction references. */
      eShop: Boolean(site.eShop),
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
    };
  }

  private async log(
    user: AuthUser,
    entity: { id: string; label: string },
    action: string,
    diff: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ) {
    await recordActivity(this.prisma, user, { entityType: 'Site', entityId: entity.id, label: entity.label, action, ...diff });
  }
}
