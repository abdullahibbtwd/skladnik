import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ComplianceFilingsService } from './filings.service';

/** Shared by every regulatory submission: validation helpers live alongside, the archive is here. */
@Module({
  imports: [StorageModule],
  providers: [ComplianceFilingsService],
  exports: [ComplianceFilingsService],
})
export class ComplianceModule {}
