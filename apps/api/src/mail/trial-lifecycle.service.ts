import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  TRIAL_ENDED_JOB,
  TRIAL_ENDING_JOB,
  TRIAL_LIFECYCLE_JOB_OPTIONS,
  TRIAL_LIFECYCLE_QUEUE,
  trialEndedJobId,
  trialEndingJobId,
  type TrialLifecycleJobData,
} from './trial-lifecycle.constants';

@Injectable()
export class TrialLifecycleMailService {
  private readonly logger = new Logger(TrialLifecycleMailService.name);

  constructor(
    @InjectQueue(TRIAL_LIFECYCLE_QUEUE) private readonly queue: Queue<TrialLifecycleJobData>,
  ) {}

  async enqueueEnding(companyId: string): Promise<boolean> {
    return this.enqueue(TRIAL_ENDING_JOB, companyId, trialEndingJobId(companyId));
  }

  async enqueueEnded(companyId: string): Promise<boolean> {
    return this.enqueue(TRIAL_ENDED_JOB, companyId, trialEndedJobId(companyId));
  }

  private async enqueue(name: string, companyId: string, jobId: string): Promise<boolean> {
    try {
      await this.queue.add(name, { companyId }, { jobId, ...TRIAL_LIFECYCLE_JOB_OPTIONS });
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/already exists|duplicat/i.test(detail)) {
        this.logger.debug(`${name} already queued for company ${companyId}`);
        return false;
      }
      this.logger.warn(`Could not enqueue ${name} for ${companyId}: ${detail}`);
      return false;
    }
  }
}
