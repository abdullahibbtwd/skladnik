import { BadRequestException, Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { SALES_MANAGER_ROLES, isReportKind, type AuthUser, type ReportKind } from '@skladnik/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ArchiveService } from './archive.service';
import { ArchiveQueryDto, ReportExportQueryDto, ReportQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

function reportKind(value: string): ReportKind {
  if (!isReportKind(value)) throw new BadRequestException('Unknown report');
  return value;
}

/** Reports cover the sites in the user's scope; omit siteId for all of them. */
@Controller('reports')
@Roles(...SALES_MANAGER_ROLES)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly archive: ArchiveService,
  ) {}

  @Get('archive/preview')
  archivePreview(@CurrentUser() user: AuthUser, @Query() query: ArchiveQueryDto) {
    return this.archive.preview(user, query);
  }

  @Get('archive')
  async archiveDownload(@CurrentUser() user: AuthUser, @Query() query: ArchiveQueryDto, @Res() res: Response) {
    // Validate scope and period before the first byte, so errors still arrive as JSON.
    await this.archive.preview(user, query);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${this.archive.fileName(query)}"`);
    res.setHeader('Cache-Control', 'no-store');
    let closed = false;
    res.on('close', () => {
      closed = true;
    });
    const sink = (chunk: Buffer) =>
      new Promise<void>((resolve) => {
        if (closed || res.write(chunk)) resolve();
        else res.once('drain', () => resolve());
      });
    try {
      await this.archive.write(user, query, sink, () => closed);
    } finally {
      res.end();
    }
  }

  @Get(':kind')
  run(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Query() query: ReportQueryDto) {
    return this.reports.run(user, reportKind(kind), query);
  }

  @Get(':kind/export')
  async export(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Query() query: ReportExportQueryDto) {
    const file = await this.reports.export(user, reportKind(kind), query);
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }
}
