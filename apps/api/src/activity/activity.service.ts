import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActivityEntry, ActivityPage, AuthUser } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import { businessRange, isBusinessDate } from '../sales/business-day';
import type { ActivityQueryDto } from './activity.dto';

const DEFAULT_LIMIT = 50;

const asRecord = (value: Prisma.JsonValue | null) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Cursor = createdAt + id of the last entry shown; entries come newest first. */
function encodeCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string) {
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(at);
  if (!id || Number.isNaN(createdAt.getTime())) throw new BadRequestException('Invalid cursor');
  return { createdAt, id };
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: ActivityQueryDto): Promise<ActivityPage> {
    const where: Prisma.ActivityLogWhereInput = { companyId: user.companyId };
    if (query.userId) where.userId = query.userId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.action) where.action = query.action;
    if (query.q?.trim()) where.entityLabel = { contains: query.q.trim(), mode: 'insensitive' };
    if (query.from || query.to) {
      const from = query.from ?? query.to!;
      const to = query.to ?? query.from!;
      if (!isBusinessDate(from) || !isBusinessDate(to) || from > to) throw new BadRequestException('Check the date range');
      const range = businessRange(from, to);
      where.createdAt = { gte: range.start, lt: range.end };
    }
    const filters: Prisma.ActivityLogWhereInput[] = [where];
    if (query.cursor) {
      const after = decodeCursor(query.cursor);
      filters.push({ OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] });
    }

    const limit = query.limit ?? DEFAULT_LIMIT;
    const [rows, users, entityTypes, actions] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { AND: filters },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.user.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.activityLog.findMany({
        where: { companyId: user.companyId },
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
      this.prisma.activityLog.findMany({
        where: { companyId: user.companyId, ...(query.entityType ? { entityType: query.entityType } : {}) },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
    ]);

    const page = rows.slice(0, limit);
    return {
      entries: page.map(
        (row): ActivityEntry => ({
          id: row.id,
          at: row.createdAt.toISOString(),
          user: row.userId || row.userName ? { id: row.userId, name: row.user?.name ?? row.userName ?? '—' } : null,
          entityType: row.entityType,
          entityId: row.entityId,
          entityLabel: row.entityLabel,
          action: row.action,
          before: asRecord(row.before),
          after: asRecord(row.after),
          metadata: asRecord(row.metadata),
        }),
      ),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
      users,
      entityTypes: entityTypes.map((row) => row.entityType),
      actions: actions.map((row) => row.action),
    };
  }
}
