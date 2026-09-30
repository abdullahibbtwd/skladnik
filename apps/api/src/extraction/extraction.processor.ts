import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionApplyService } from './extraction-apply.service';
import { ExtractorService } from './extractor.service';
import { isUnrecoverableVisionError, isVisionTransientError } from './ocr-errors';
import { OCR_QUEUE, type OcrJobData } from './ocr.constants';

async function streamToBuffer(body: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// The free GLM vision tier rate-limits parallel requests (1302), so extra
// workers only turn waiting into failures. The lock is renewed while a job
// runs; its duration only bounds how long a job orphaned by a restart waits.
@Processor(OCR_QUEUE, { concurrency: 1, lockDuration: 60_000, maxStalledCount: 2 })
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
    const startedAt = Date.now();
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
      const fetchedAt = Date.now();
      const extracted = await this.extractor.extractFromImage(image, object.contentType);
      const extractedAt = Date.now();
      if (!extracted.ok) {
        throw new Error(extracted.error);
      }
      try {
        await this.apply.apply(capture.id, extracted.data);
      } catch (error) {
        throw new UnrecoverableError(errorMessage(error, 'Saving OCR result failed'));
      }
      this.logger.log(
        `OCR timings for capture ${capture.id} (${extracted.model}, ${extracted.data.lines.length} lines): ` +
          `since upload ${startedAt - job.timestamp}ms, fetch ${fetchedAt - startedAt}ms, ` +
          `vision ${extractedAt - fetchedAt}ms, apply ${Date.now() - extractedAt}ms, ` +
          `output ${extracted.timings.outputTokens ?? '?'} tokens (reasoning ${extracted.timings.reasoningTokens ?? '?'})`,
      );
      return { ok: true, lines: extracted.data.lines.length, confidence: extracted.data.confidence };
    } catch (error) {
      const message = errorMessage(error, 'Extraction failed');
      const attempts = job.opts.attempts ?? 1;
      const lastAttempt = job.attemptsMade + 1 >= attempts;
      const retryable =
        !(error instanceof UnrecoverableError) && !isUnrecoverableVisionError(message) && isVisionTransientError(message);
      const waiting = retryable && !lastAttempt;

      await this.prisma.documentCapture.update({
        where: { id: capture.id },
        data: waiting
          ? { extractionStatus: 'QUEUED', extractionError: null }
          : {
              extractionStatus: 'FAILED',
              extractionError: message,
              ocrRaw: { extractionFailed: true, error: message },
            },
      });
      this.logger.warn(
        waiting
          ? `OCR waiting to retry capture ${capture.id} (attempt ${job.attemptsMade + 1}/${attempts}): ${message}`
          : `OCR failed for capture ${capture.id}: ${message}`,
      );
      if (!retryable) {
        throw new UnrecoverableError(message);
      }
      throw error;
    }
  }
}
