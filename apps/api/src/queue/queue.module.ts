import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueController } from './queue.controller';
import { TEST_QUEUE } from './queue.constants';
import { TestProcessor } from './test.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
        },
      }),
    }),
    BullModule.registerQueue({ name: TEST_QUEUE }),
  ],
  controllers: [QueueController],
  providers: [TestProcessor],
})
export class QueueModule {}
