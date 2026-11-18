import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  FIRST_SCAN_NUDGE_JOB,
  FIRST_SCAN_NUDGE_JOB_OPTIONS,
  FIRST_SCAN_NUDGE_QUEUE,
  firstScanNudgeJobId,
  type FirstScanNudgeJobData,
} from './first-scan-nudge.constants';

@Injectable()
export class FirstScanNudgeMailService {
  private readonly logger = new Logger(FirstScanNudgeMailService.name);

  constructor(
    @InjectQueue(FIRST_SCAN_NUDGE_QUEUE) private readonly queue: Queue<FirstScanNudgeJobData>,
  ) {}

  /** Enqueue a first-scan nudge. Never throws — cron must not fail on Redis blips. */
  async enqueue(companyId: string): Promise<boolean> {
    try {
      await this.queue.add(
        FIRST_SCAN_NUDGE_JOB,
        { companyId },
        {
          jobId: firstScanNudgeJobId(companyId),
          ...FIRST_SCAN_NUDGE_JOB_OPTIONS,
        },
      );
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/already exists|duplicat/i.test(detail)) {
        this.logger.debug(`First-scan nudge already queued for company ${companyId}`);
        return false;
      }
      this.logger.warn(`Could not enqueue first-scan nudge for ${companyId}: ${detail}`);
      return false;
    }
  }
}
