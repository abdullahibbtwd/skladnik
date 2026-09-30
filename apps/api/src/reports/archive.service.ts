import { BadRequestException, Injectable } from '@nestjs/common';
import type { Readable } from 'stream';
import {
  REPORT_DOCUMENT_TYPE_LABELS,
  WRITE_OFF_REASON_LABELS,
  partnerTaxNumber,
  isPaperDocumentType,
  type AuthUser,
  type DocumentType,
  type ReportLang,
} from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { ArchiveQueryDto } from './dto/report.dto';
import { planArchive } from './archive-plan';
import { buildCsv, type CsvColumn } from './export/csv';
import { ZIP_MAX_BYTES, ZIP_MAX_ENTRIES, ZipWriter } from './export/zip';
import { ReportsService } from './reports.service';

const STATUS_LABELS: Record<string, Record<ReportLang, string>> = {
  POSTED: { en: 'Posted', bg: 'Осчетоводен' },
  REVIEW: { en: 'In review', bg: 'За преглед' },
  DRAFT: { en: 'Draft', bg: 'Чернова' },
};

const INDEX_HEADERS: Record<ReportLang, string[]> = {
  en: ['File', 'Date', 'Document', 'Number', 'Partner', 'VAT / EIK', 'Site', 'Status', 'Page', 'Note'],
  bg: ['Файл', 'Дата', 'Документ', 'Номер', 'Контрагент', 'ДДС № / ЕИК', 'Обект', 'Статус', 'Страница', 'Бележка'],
};
const INDEX_TYPES: CsvColumn['type'][] = ['text', 'date', 'text', 'text', 'text', 'text', 'text', 'text', 'int', 'text'];
const MISSING_FILE: Record<ReportLang, string> = { en: 'File could not be read from storage', bg: 'Файлът не можа да бъде прочетен' };
const TRUNCATED: Record<ReportLang, string> = { en: 'Archive size limit reached; narrow the period', bg: 'Достигнат е лимитът на архива; стеснете периода' };

async function readAll(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Bulk download of original document photos and PDFs for the accountant (§4.8). */
@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly reports: ReportsService,
  ) {}

  async preview(user: AuthUser, query: ArchiveQueryDto) {
    const plan = await this.plan(user, query);
    return {
      from: plan.from,
      to: plan.to,
      documents: plan.documents.length,
      files: plan.files.length,
      withoutScans: plan.withoutScans,
      sample: plan.files.slice(0, 8).map((file) => file.name),
    };
  }

  fileName(query: ArchiveQueryDto) {
    return `documents_${query.from}_${query.to}.zip`;
  }

  /** Streams the ZIP; stops quietly if the client goes away. */
  async write(user: AuthUser, query: ArchiveQueryDto, sink: (chunk: Buffer) => Promise<void>, aborted: () => boolean) {
    const lang = query.lang ?? 'en';
    const plan = await this.plan(user, query);
    const byId = new Map(plan.documents.map((doc) => [doc.id, doc]));
    const zip = new ZipWriter(sink);
    const index: (string | number | null)[][] = [];
    let truncated = false;

    for (const file of plan.files) {
      if (aborted()) return;
      const doc = byId.get(file.documentId)!;
      let note: string | null = null;
      try {
        const object = await this.storage.getObject(file.key);
        const data = await readAll(object.body);
        if (zip.size + data.length > ZIP_MAX_BYTES) {
          truncated = true;
          break;
        }
        await zip.add(file.name, data, { date: new Date(`${doc.issuedOn}T12:00:00Z`) });
      } catch {
        if (aborted()) return;
        note = MISSING_FILE[lang];
      }
      index.push([
        file.name,
        doc.issuedOn,
        doc.typeLabel,
        doc.number,
        doc.partner,
        doc.partnerTaxId,
        doc.site,
        STATUS_LABELS[doc.status]?.[lang] ?? doc.status,
        file.pageNumber,
        note,
      ]);
    }
    if (truncated) index.push([TRUNCATED[lang], null, null, null, null, null, null, null, null, null]);

    const columns = INDEX_HEADERS[lang].map((header, position) => ({ header, type: INDEX_TYPES[position] }));
    const csv = buildCsv(
      columns,
      index,
      lang === 'bg'
        ? { delimiter: ';', decimalSeparator: ',', dateFormat: 'DD.MM.YYYY', encoding: 'UTF8_BOM', includeHeader: true }
        : { delimiter: ',', decimalSeparator: '.', dateFormat: 'YYYY-MM-DD', encoding: 'UTF8_BOM', includeHeader: true },
    );
    await zip.add('index.csv', csv, { compress: true });
    await zip.finish();
  }

  private async plan(user: AuthUser, query: ArchiveQueryDto) {
    const lang = query.lang ?? 'en';
    const scope = await this.reports.scope(user, query.siteId);
    const { from, to } = this.reports.period(query);
    const docs = await this.prisma.document.findMany({
      where: {
        companyId: user.companyId,
        siteId: { in: scope.siteIds },
        issuedOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        status: query.includeUnposted ? { not: 'CANCELLED' } : 'POSTED',
        type: { not: 'SALE' },
      },
      orderBy: [{ issuedOn: 'asc' }, { number: 'asc' }],
      select: {
        id: true,
        type: true,
        number: true,
        issuedOn: true,
        status: true,
        siteId: true,
        writeOffReason: true,
        partner: { select: { name: true, eik: true, vatNumber: true } },
        captures: { select: { pageNumber: true, imageKey: true, sourceKey: true } },
      },
    });

    const documents = docs
      .filter((doc) => doc.captures.length > 0)
      .map((doc) => {
        const type = doc.type as DocumentType;
        const typeLabel = doc.writeOffReason
          ? `${REPORT_DOCUMENT_TYPE_LABELS[type][lang]} — ${WRITE_OFF_REASON_LABELS[doc.writeOffReason][lang]}`
          : REPORT_DOCUMENT_TYPE_LABELS[type][lang];
        return {
          id: doc.id,
          number: doc.number,
          issuedOn: doc.issuedOn.toISOString().slice(0, 10),
          status: doc.status,
          typeLabel,
          partner: doc.partner?.name ?? null,
          partnerTaxId: partnerTaxNumber(doc.partner),
          partyName: doc.partner?.name ?? REPORT_DOCUMENT_TYPE_LABELS[type][lang],
          site: scope.siteName.get(doc.siteId) ?? '',
          captures: doc.captures,
        };
      });
    const files = planArchive(documents, { siteFolders: scope.multi });
    if (files.length >= ZIP_MAX_ENTRIES) throw new BadRequestException('Too many files for one archive; narrow the period');
    const withoutScans = docs.filter(
      (doc) => doc.captures.length === 0 && isPaperDocumentType(doc.type as DocumentType),
    ).length;
    return { from, to, documents, files, withoutScans };
  }
}
