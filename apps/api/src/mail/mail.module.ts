import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import {
  FIRST_SCAN_NUDGE_JOB_OPTIONS,
  FIRST_SCAN_NUDGE_QUEUE,
} from './first-scan-nudge.constants';
import { FirstScanNudgeProcessor } from './first-scan-nudge.processor';
import { FirstScanNudgeMailService } from './first-scan-nudge.service';
import { MailService } from './mail.service';
import {
  TRIAL_LIFECYCLE_JOB_OPTIONS,
  TRIAL_LIFECYCLE_QUEUE,
} from './trial-lifecycle.constants';
import { TrialLifecycleProcessor } from './trial-lifecycle.processor';
import { TrialLifecycleMailService } from './trial-lifecycle.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';
import { WELCOME_JOB_OPTIONS, WELCOME_QUEUE } from './welcome.constants';
import { WelcomeMailProcessor } from './welcome.processor';
import { WelcomeMailService } from './welcome.service';
import { RateLimitGuard } from '../auth/guards/rate-limit.guard';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: WELCOME_QUEUE,
      defaultJobOptions: WELCOME_JOB_OPTIONS,
    }),
    BullModule.registerQueue({
      name: FIRST_SCAN_NUDGE_QUEUE,
      defaultJobOptions: FIRST_SCAN_NUDGE_JOB_OPTIONS,
    }),
    BullModule.registerQueue({
      name: TRIAL_LIFECYCLE_QUEUE,
      defaultJobOptions: TRIAL_LIFECYCLE_JOB_OPTIONS,
    }),
  ],
  controllers: [UnsubscribeController],
  providers: [
    MailService,
    WelcomeMailService,
    WelcomeMailProcessor,
    FirstScanNudgeMailService,
    FirstScanNudgeProcessor,
    TrialLifecycleMailService,
    TrialLifecycleProcessor,
    UnsubscribeService,
    RateLimitGuard,
  ],
  exports: [
    MailService,
    WelcomeMailService,
    FirstScanNudgeMailService,
    TrialLifecycleMailService,
    UnsubscribeService,
    BullModule,
  ],
})
export class MailModule {}
