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
import { PrismaService } from '../prisma/prisma.service';
import { zipToBuffer } from '../reports/export/zip';
import { StorageService } from '../storage/storage.service';
import { sha256 } from './hash';

export type FilingFileInput = { name: string; body: Buffer; contentType: string };

export type NewFiling = {
  kind: ComplianceFilingKind;
  period: string;
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

  async list(companyId: string, kind: ComplianceFilingKind, period?: string) {
    const rows = await this.prisma.complianceFiling.findMany({
      where: { companyId, kind, ...(period ? { period } : {}) },
      orderBy: [{ period: 'desc' }, { version: 'desc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  async latest(companyId: string, kind: ComplianceFilingKind, period: string) {
    const row = await this.prisma.complianceFiling.findFirst({ where: { companyId, kind, period }, orderBy: { version: 'desc' } });
    return row ? this.toRecord(row) : null;
  }

  async create(user: AuthUser, filing: NewFiling) {
    const last = await this.prisma.complianceFiling.findFirst({
      where: { companyId: user.companyId, kind: filing.kind, period: filing.period },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    const prefix = `compliance/${user.companyId}/${filing.kind}/${filing.period}/v${version}`;
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
          version,
          sourceHash: filing.sourceHash,
          summary: filing.summary as Prisma.InputJsonValue,
          issues: filing.issues as unknown as Prisma.InputJsonValue,
          files: files as unknown as Prisma.InputJsonValue,
          createdById: user.id,
          createdByName: user.name || user.email,
        },
      });
      await this.prisma.activityLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          entityType: 'ComplianceFiling',
          entityId: row.id,
          action: 'GENERATE',
          metadata: { kind: filing.kind, period: filing.period, version },
        },
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
    const row = await this.find(user.companyId, id);
    const updated = await this.prisma.complianceFiling.update({
      where: { id: row.id },
      data: { submissionRef, submittedAt, submittedByName: user.name || user.email },
    });
    await this.prisma.activityLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entityType: 'ComplianceFiling',
        entityId: row.id,
        action: 'SUBMITTED',
        metadata: { submissionRef, submittedAt: submittedAt.toISOString() },
      },
    });
    return this.toRecord(updated);
  }

  /** The archived files, re-checked against their stored SHA-256. */
  async files(companyId: string, id: string) {
    const row = await this.find(companyId, id);
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

  async zip(companyId: string, id: string) {
    const { filing, files } = await this.files(companyId, id);
    return { filing, body: await zipToBuffer(files) };
  }

  private async find(companyId: string, id: string) {
    const row = await this.prisma.complianceFiling.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Filing not found');
    return row;
  }

  toRecord(row: FilingRow): ComplianceFilingRecord {
    return {
      id: row.id,
      kind: row.kind as ComplianceFilingKind,
      period: row.period,
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
