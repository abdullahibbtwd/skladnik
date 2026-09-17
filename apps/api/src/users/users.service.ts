import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, type User } from '@prisma/client';
import { isCompanyWideRole, type AuthUser } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser) {
    const users = await this.prisma.user.findMany({
      where: { companyId: actor.companyId },
      include: {
        sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return { users: users.map((user) => this.serialize(user)) };
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.findInCompany(actor.companyId, id);

    if (dto.role !== undefined || dto.isActive === false) {
      await this.assertNotLastOwner(actor.companyId, target, dto);
    }

    if (id === actor.id && dto.role !== undefined && dto.role !== target.role) {
      throw new ForbiddenException('You cannot change your own role');
    }
    if (id === actor.id && dto.isActive === false) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const nextRole = dto.role ?? target.role;
    if (dto.siteIds !== undefined) {
      await this.assertCompanySites(actor.companyId, dto.siteIds);
      if (!isCompanyWideRole(nextRole) && dto.siteIds.length === 0) {
        throw new BadRequestException('Site managers and staff need at least one assigned site');
      }
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: {
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      if (dto.siteIds !== undefined) {
        await tx.userSite.deleteMany({ where: { userId: target.id } });
        if (!isCompanyWideRole(nextRole) && dto.siteIds.length > 0) {
          await tx.userSite.createMany({
            data: dto.siteIds.map((siteId) => ({ userId: target.id, siteId })),
          });
        }
      } else if (dto.role !== undefined && isCompanyWideRole(dto.role)) {
        await tx.userSite.deleteMany({ where: { userId: target.id } });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
        },
      });
    });

    await this.prisma.activityLog.create({
      data: {
        companyId: actor.companyId,
        userId: actor.id,
        entityType: 'User',
        entityId: user.id,
        action: 'UPDATE',
        metadata: { fields: Object.keys(dto) },
      },
    });

    return { user: this.serialize(user) };
  }

  async deactivate(actor: AuthUser, id: string) {
    return this.update(actor, id, { isActive: false });
  }

  private async findInCompany(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      include: {
        sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async assertNotLastOwner(
    companyId: string,
    target: User,
    dto: UpdateUserDto,
  ) {
    const demotingOwner = target.role === UserRole.OWNER && dto.role !== undefined && dto.role !== UserRole.OWNER;
    const deactivatingOwner = target.role === UserRole.OWNER && dto.isActive === false;
    if (!demotingOwner && !deactivatingOwner) return;

    const ownerCount = await this.prisma.user.count({
      where: { companyId, role: UserRole.OWNER, isActive: true },
    });
    if (ownerCount <= 1) {
      throw new ForbiddenException('The company must keep at least one active owner');
    }
  }

  private async assertCompanySites(companyId: string, siteIds: string[]) {
    if (siteIds.length === 0) return;
    const sites = await this.prisma.site.findMany({
      where: { companyId, id: { in: siteIds }, isActive: true },
      select: { id: true },
    });
    if (sites.length !== siteIds.length) {
      throw new BadRequestException('One or more sites are not active in this company');
    }
  }

  private serialize(
    user: User & {
      sites: { site: { id: string; name: string; isActive: boolean } }[];
    },
  ) {
    const allSites = isCompanyWideRole(user.role);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      allSites,
      sites: allSites ? [] : user.sites.map((row) => row.site),
    };
  }
}
