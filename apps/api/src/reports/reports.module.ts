import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { ArchiveService } from './archive.service';
import { ExportProfilesController } from './export-profiles.controller';
import { ExportProfilesService } from './export-profiles.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ReportsController, ExportProfilesController],
  providers: [ReportsService, ArchiveService, ExportProfilesService],
})
export class ReportsModule {}
