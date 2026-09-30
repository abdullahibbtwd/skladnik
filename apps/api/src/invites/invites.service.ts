import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Invitation, User, UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { isCompanyWideRole, ROLE_LABELS, type AuthUser, type UserRole as SharedRole } from '@skladnik/shared';
import { MailService } from '../mail/mail.service';
import { recordActivity } from '../activity/record-activity';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { SignupWithInviteDto } from '../auth/dto/signup-with-invite.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type InvitationRecord = Invitation & {
  company: { name: string };
  invitedBy: { id: string; name: string };
  sites: { site: { id: string; name: string; isActive: boolean } }[];
};

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async list(actor: AuthUser) {
    const invites = await this.prisma.invitation.findMany({
      where: { companyId: actor.companyId },
      include: {
        company: { select: { name: true } },
        invitedBy: { select: { id: true, name: true } },
        sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { invites: invites.map((invite) => this.serialize(invite)) };
  }

  async preview(rawToken: string) {
    const invite = await this.findByToken(rawToken);
    this.assertAcceptable(invite);

    return {
      email: invite.email,
      role: invite.role,
      roleLabel: ROLE_LABELS[invite.role as SharedRole],
      companyName: invite.company.name,
      expiresAt: invite.expiresAt,
    };
  }

  async create(actor: AuthUser, dto: CreateInviteDto) {
    const email = dto.email.trim().toLowerCase();
    this.assertRoleSites(dto.role, dto.siteIds);
    await this.assertCompanySites(actor.companyId, dto.siteIds ?? []);
    await this.assertEmailAvailable(email, actor.companyId);

    const existing = await this.prisma.invitation.findUnique({
      where: { companyId_email: { companyId: actor.companyId, email } },
    });
    if (existing?.acceptedAt) {
      throw new ConflictException('This email has already accepted an invite');
    }

    const { token, tokenHash, expiresAt } = this.newToken();
    const invite = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.invitation.update({
            where: { id: existing.id },
            data: {
              role: dto.role,
              tokenHash,
              invitedById: actor.id,
              expiresAt,
              acceptedAt: null,
              revokedAt: null,
              sites: { deleteMany: {} },
            },
          })
        : await tx.invitation.create({
            data: {
              companyId: actor.companyId,
              email,
              role: dto.role,
              tokenHash,
              invitedById: actor.id,
              expiresAt,
            },
          });

      if (!isCompanyWideRole(dto.role) && dto.siteIds?.length) {
        await tx.invitationSite.createMany({
          data: dto.siteIds.map((siteId) => ({ invitationId: saved.id, siteId })),
        });
      }

      return tx.invitation.findUniqueOrThrow({
        where: { id: saved.id },
        include: {
          company: { select: { name: true } },
          invitedBy: { select: { id: true, name: true } },
          sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
        },
      });
    });

    const inviteUrl = this.inviteUrl(token);
    const delivered = await this.send(invite, inviteUrl);

    await this.log(actor, invite, 'CREATE', { after: { email, role: dto.role } });
    return { invite: this.serialize(invite), inviteUrl, delivered };
  }

  async resend(actor: AuthUser, id: string) {
    const existing = await this.findInCompany(actor.companyId, id);
    this.assertPending(existing);

    const { token, tokenHash, expiresAt } = this.newToken();
    const invite = await this.prisma.invitation.update({
      where: { id: existing.id },
      data: { tokenHash, expiresAt, invitedById: actor.id },
      include: {
        company: { select: { name: true } },
        invitedBy: { select: { id: true, name: true } },
        sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
      },
    });

    const inviteUrl = this.inviteUrl(token);
    const delivered = await this.send(invite, inviteUrl);
    await this.log(actor, invite, 'RESEND', {});
    return { invite: this.serialize(invite), inviteUrl, delivered };
  }

  async revoke(actor: AuthUser, id: string) {
    const existing = await this.findInCompany(actor.companyId, id);
    this.assertPending(existing);

    const invite = await this.prisma.invitation.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
      include: {
        company: { select: { name: true } },
        invitedBy: { select: { id: true, name: true } },
        sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
      },
    });

    await this.log(actor, invite, 'REVOKE', {});
    return { invite: this.serialize(invite) };
  }

  async accept(dto: SignupWithInviteDto): Promise<User> {
    const invite = await this.findByToken(dto.token);
    this.assertAcceptable(invite);

    const email = dto.email.trim().toLowerCase();
    if (email !== invite.email) {
      throw new BadRequestException('Use the email address this invite was sent to');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
      const siteIds = invite.sites.filter((row) => row.site.isActive).map((row) => row.site.id);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: dto.name.trim(),
          role: invite.role,
          companyId: invite.companyId,
        },
      });

      if (!isCompanyWideRole(invite.role) && siteIds.length > 0) {
        await tx.userSite.createMany({
          data: siteIds.map((siteId) => ({ userId: created.id, siteId })),
        });
      }

      await tx.invitation.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), revokedAt: null },
      });

      await recordActivity(tx, created, {
        entityType: 'Invitation',
        entityId: invite.id,
        label: invite.email,
        action: 'ACCEPT',
        after: { role: invite.role },
      });

      return created;
    });
  }

  private async send(invite: InvitationRecord, inviteUrl: string) {
    const { delivered } = await this.mail.sendInviteEmail({
      to: invite.email,
      companyName: invite.company.name,
      roleLabel: ROLE_LABELS[invite.role as SharedRole],
      inviterName: invite.invitedBy.name,
      inviteUrl,
    });
    return delivered;
  }

  private async findByToken(rawToken: string) {
    const tokenHash = hashInviteToken(rawToken);
    const invite = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        company: { select: { name: true } },
        invitedBy: { select: { id: true, name: true } },
        sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
      },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    return invite;
  }

  private async findInCompany(companyId: string, id: string) {
    const invite = await this.prisma.invitation.findFirst({
      where: { id, companyId },
      include: {
        company: { select: { name: true } },
        invitedBy: { select: { id: true, name: true } },
        sites: { include: { site: { select: { id: true, name: true, isActive: true } } } },
      },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    return invite;
  }

  private assertAcceptable(invite: Invitation) {
    if (invite.acceptedAt) {
      throw new BadRequestException('This invite has already been used');
    }
    if (invite.revokedAt) {
      throw new GoneException('This invite is no longer valid');
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('This invite has expired');
    }
  }

  private assertPending(invite: Invitation) {
    if (invite.acceptedAt) {
      throw new BadRequestException('This invite has already been used');
    }
    if (invite.revokedAt) {
      throw new BadRequestException('This invite was revoked');
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This invite has expired');
    }
  }

  private assertRoleSites(role: UserRole, siteIds?: string[]) {
    if (!isCompanyWideRole(role) && (!siteIds || siteIds.length === 0)) {
      throw new BadRequestException('Site managers and staff need at least one site');
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

  private async assertEmailAvailable(email: string, companyId: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.companyId === companyId) {
      throw new ConflictException('This email already belongs to someone in your company');
    }
    if (user) {
      throw new ConflictException('This email is already registered');
    }
  }

  private newToken() {
    const token = randomBytes(32).toString('hex');
    return {
      token,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    };
  }

  private inviteUrl(token: string) {
    const origin = (this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5176').replace(/\/$/, '');
    return `${origin}/signup?invite=${token}`;
  }

  private serialize(invite: InvitationRecord) {
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: this.status(invite),
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
      createdAt: invite.createdAt,
      invitedBy: invite.invitedBy,
      sites: invite.sites.map((row) => row.site),
    };
  }

  private status(invite: Invitation) {
    if (invite.acceptedAt) return 'ACCEPTED' as const;
    if (invite.revokedAt) return 'REVOKED' as const;
    if (invite.expiresAt.getTime() <= Date.now()) return 'EXPIRED' as const;
    return 'PENDING' as const;
  }

  private async log(
    actor: AuthUser,
    invite: { id: string; email: string },
    action: string,
    diff: { before?: Record<string, unknown>; after?: Record<string, unknown> },
  ) {
    await recordActivity(this.prisma, actor, { entityType: 'Invitation', entityId: invite.id, label: invite.email, action, ...diff });
  }
}

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
