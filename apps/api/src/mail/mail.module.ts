import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { WELCOME_JOB_OPTIONS, WELCOME_QUEUE } from './welcome.constants';
import { WelcomeMailProcessor } from './welcome.processor';
import { WelcomeMailService } from './welcome.service';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: WELCOME_QUEUE,
      defaultJobOptions: WELCOME_JOB_OPTIONS,
    }),
  ],
  providers: [MailService, WelcomeMailService, WelcomeMailProcessor],
  exports: [MailService, WelcomeMailService, BullModule],
})
export class MailModule {}
