import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  WELCOME_JOB_OPTIONS,
  WELCOME_JOB_SEND,
  WELCOME_QUEUE,
  welcomeJobId,
  type WelcomeJobData,
} from './welcome.constants';

@Injectable()
export class WelcomeMailService {
  private readonly logger = new Logger(WelcomeMailService.name);

  constructor(@InjectQueue(WELCOME_QUEUE) private readonly queue: Queue<WelcomeJobData>) {}

  /**
   * Enqueue a welcome email. Never throws to callers — signup/verify must not fail
   * because Redis/queue is unavailable.
   */
  async enqueueWelcome(userId: string): Promise<void> {
    try {
      await this.queue.add(
        WELCOME_JOB_SEND,
        { userId },
        {
          jobId: welcomeJobId(userId),
          ...WELCOME_JOB_OPTIONS,
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Duplicate jobId is fine (already queued / completed).
      if (/already exists|duplicat/i.test(detail)) {
        this.logger.debug(`Welcome job already queued for user ${userId}`);
        return;
      }
      this.logger.warn(`Could not enqueue welcome email for ${userId}: ${detail}`);
    }
  }
}
