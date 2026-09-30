import { Readable } from 'node:stream';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AuthUser,
  ComplianceFilingFile,
  ComplianceFilingKind,
  ComplianceFilingRecord,
  ComplianceIssue,
} from '@skladnik/shared';
import { recordActivity } from '../activity/record-activity';
import { PrismaService } from '../prisma/prisma.service';
import { zipToBuffer } from '../reports/export/zip';
import { StorageService } from '../storage/storage.service';
import { sha256 } from './hash';

export type FilingFileInput = { name: string; body: Buffer; contentType: string };

export type NewFiling = {
  kind: ComplianceFilingKind;
  period: string;
  /** '' company-wide; the site id for a per-site filing. */
  scope?: string;
  /** Activity log label; defaults to kind and period. */
  label?: string;
  sourceHash: string;
  summary: Record<string, number | string>;
  issues: ComplianceIssue[];
  files: FilingFileInput[];
};

type FilingRow = Prisma.ComplianceFilingGetPayload<object>;

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * The archive of generated submissions. A filing is written once (files in object storage with their
 * SHA-256) and only ever gains a "submitted" mark; a correction is the next version for the period.
 */
@Injectable()
export class ComplianceFilingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(companyId: string, kind: ComplianceFilingKind, period?: string, scope = '') {
    const rows = await this.prisma.complianceFiling.findMany({
      where: { companyId, kind, scope, ...(period ? { period } : {}) },
      orderBy: [{ period: 'desc' }, { version: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  /** Every filing of a kind, all periods and scopes, newest first. */
  async archive(companyId: string, kind: ComplianceFilingKind, limit = 200) {
    const rows = await this.prisma.complianceFiling.findMany({
      where: { companyId, kind },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((row) => this.toRecord(row));
  }

  async latest(companyId: string, kind: ComplianceFilingKind, period: string, scope = '') {
    const row = await this.prisma.complianceFiling.findFirst({ where: { companyId, kind, period, scope }, orderBy: { version: 'desc' } });
    return row ? this.toRecord(row) : null;
  }

  async create(user: AuthUser, filing: NewFiling) {
    const scope = filing.scope ?? '';
    const last = await this.prisma.complianceFiling.findFirst({
      where: { companyId: user.companyId, kind: filing.kind, period: filing.period, scope },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const prefix = `compliance/${user.companyId}/${filing.kind}/${scope ? `${scope}/` : ''}${filing.period}/v${version}`;
    const files: ComplianceFilingFile[] = [];
    for (const file of filing.files) {
      const key = `${prefix}/${file.name}`;
      await this.storage.putObject(key, file.body, file.contentType);
      files.push({ name: file.name, key, size: file.body.length, sha256: sha256(file.body) });
    }
    try {
      const row = await this.prisma.complianceFiling.create({
        data: {
          companyId: user.companyId,
          kind: filing.kind,
          period: filing.period,
          scope,
          version,
          sourceHash: filing.sourceHash,
          summary: filing.summary as Prisma.InputJsonValue,
          issues: filing.issues as unknown as Prisma.InputJsonValue,
          files: files as unknown as Prisma.InputJsonValue,
          createdById: user.id,
          createdByName: user.name || user.email,
        },
      });
      await recordActivity(this.prisma, user, {
        entityType: 'ComplianceFiling',
        entityId: row.id,
        label: filing.label ?? `${filing.kind} ${filing.period}`,
        action: 'GENERATE',
        metadata: { kind: filing.kind, period: filing.period, version, ...(scope ? { scope } : {}), files: files.map(({ name, sha256: hash }) => ({ name, sha256: hash })) },
      });
      return this.toRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Another version was generated at the same time. Refresh and try again.');
      }
      throw error;
    }
  }

  async markSubmitted(user: AuthUser, id: string, submissionRef: string, submittedAt: Date) {
    const row = await this.row(user.companyId, id);
    const updated = await this.prisma.complianceFiling.update({
      where: { id: row.id },
      data: { submissionRef, submittedAt, submittedByName: user.name || user.email },
    });
    await recordActivity(this.prisma, user, {
      entityType: 'ComplianceFiling',
      entityId: row.id,
      label: `${row.kind} ${row.period}`,
      action: 'SUBMITTED',
      before: { submissionRef: row.submissionRef, submittedAt: row.submittedAt },
      after: { submissionRef, submittedAt },
    });
    return this.toRecord(updated);
  }

  /** The archived files, re-checked against their stored SHA-256. */
  async files(companyId: string, id: string) {
    const row = await this.row(companyId, id);
    const files = row.files as unknown as ComplianceFilingFile[];
    const out: { name: string; data: Buffer }[] = [];
    for (const file of files) {
      const object = await this.storage.getObject(file.key);
      const data = await streamToBuffer(object.body);
      if (sha256(data) !== file.sha256) throw new BadRequestException(`Archived file ${file.name} does not match its checksum.`);
      out.push({ name: file.name, data });
    }
    return { filing: this.toRecord(row), files: out };
  }

  async find(companyId: string, id: string, kind: ComplianceFilingKind) {
    const row = await this.row(companyId, id);
    if (row.kind !== kind) throw new NotFoundException('Filing not found');
    return this.toRecord(row);
  }

  async zip(companyId: string, id: string) {
    const { filing, files } = await this.files(companyId, id);
    return { filing, body: await zipToBuffer(files) };
  }

  private async row(companyId: string, id: string) {
    const row = await this.prisma.complianceFiling.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Filing not found');
    return row;
  }

  toRecord(row: FilingRow): ComplianceFilingRecord {
    return {
      id: row.id,
      kind: row.kind as ComplianceFilingKind,
      period: row.period,
      scope: row.scope,
      version: row.version,
      sourceHash: row.sourceHash,
      summary: row.summary as Record<string, number | string>,
      issues: row.issues as unknown as ComplianceIssue[],
      files: (row.files as unknown as ComplianceFilingFile[]).map(({ name, size, sha256: hash }) => ({ name, size, sha256: hash })),
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByName,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      submissionRef: row.submissionRef,
      submittedByName: row.submittedByName,
    };
  }
}
