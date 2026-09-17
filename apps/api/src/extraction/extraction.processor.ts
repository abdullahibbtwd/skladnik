import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionApplyService } from './extraction-apply.service';
import { ExtractorService } from './extractor.service';
import { isUnrecoverableVisionError } from './ocr-errors';
import { OCR_QUEUE, type OcrJobData } from './ocr.constants';

async function streamToBuffer(body: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Processor(OCR_QUEUE)
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly extractor: ExtractorService,
    private readonly apply: ExtractionApplyService,
  ) {
    super();
  }

  async process(job: Job<OcrJobData>) {
    const capture = await this.prisma.documentCapture.findUnique({ where: { id: job.data.captureId } });
    if (!capture) {
      throw new UnrecoverableError('Capture not found');
    }

    await this.prisma.documentCapture.update({
      where: { id: capture.id },
      data: { extractionStatus: 'RUNNING', extractionError: null },
    });

    try {
      if (!this.extractor.apiKey()) {
        throw new UnrecoverableError('GLM/Z.AI API key is not configured');
      }
      const object = await this.storage.getObject(capture.imageKey);
      const image = await streamToBuffer(object.body);
      const extracted = await this.extractor.extractFromImage(image, object.contentType);
      if (!extracted.ok) {
        throw new Error(extracted.error);
      }
      await this.apply.apply(capture.id, extracted.data);
      return { ok: true, lines: extracted.data.lines.length, confidence: extracted.data.confidence };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Extraction failed';
      await this.prisma.documentCapture.update({
        where: { id: capture.id },
        data: {
          extractionStatus: 'FAILED',
          extractionError: message,
          ocrRaw: { extractionFailed: true, error: message },
        },
      });
      this.logger.warn(`OCR failed for capture ${capture.id}: ${message}`);
      if (isUnrecoverableVisionError(message) || error instanceof UnrecoverableError) {
        throw new UnrecoverableError(message);
      }
      throw error;
    }
  }
}
