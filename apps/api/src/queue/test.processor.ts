import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TEST_QUEUE } from './queue.constants';

@Processor(TEST_QUEUE)
export class TestProcessor extends WorkerHost {
  private readonly logger = new Logger(TestProcessor.name);

  async process(job: Job<{ message?: string }>) {
    this.logger.log(`processed job ${job.id}: ${job.data.message ?? 'hello from bullmq'}`);
    return { ok: true, jobId: job.id };
  }
}
