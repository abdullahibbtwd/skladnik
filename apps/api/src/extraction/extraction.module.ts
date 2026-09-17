import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ExtractionApplyService } from './extraction-apply.service';
import { ExtractionProcessor } from './extraction.processor';
import { ExtractorService } from './extractor.service';
import { OCR_QUEUE } from './ocr.constants';

@Module({
  imports: [StorageModule, BullModule.registerQueue({ name: OCR_QUEUE })],
  providers: [ExtractorService, ExtractionApplyService, ExtractionProcessor],
  exports: [BullModule, ExtractorService],
})
export class ExtractionModule {}
