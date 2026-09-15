import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TEST_QUEUE } from './queue.constants';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller()
export class QueueController {
  constructor(@InjectQueue(TEST_QUEUE) private readonly testQueue: Queue) {}

  @Post('test-job')
  async enqueue() {
    const job = await this.testQueue.add('ping', {
      message: 'infrastructure probe',
      enqueuedAt: new Date().toISOString(),
    });

    return { jobId: job.id, queue: TEST_QUEUE };
  }

  @Get('test-job/:id')
  async status(@Param('id') id: string) {
    const job = await this.testQueue.getJob(id);
    if (!job) {
      throw new NotFoundException(`job ${id} not found`);
    }

    return {
      jobId: job.id,
      state: await job.getState(),
      data: job.data,
      returnvalue: job.returnvalue,
    };
  }
}
