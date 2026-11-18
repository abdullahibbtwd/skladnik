import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ActivationCiphertextSweepService } from './activation-ciphertext-sweep.service';
import { ActivationFailureAlertsService } from './activation-failure-alerts.service';
import { FirstScanNudgeCron } from './first-scan-nudge.cron';
import { PlatformSubscriptionsController } from './platform-subscriptions.controller';
import { PlatformSubscriptionsService } from './platform-subscriptions.service';
import { SubscriptionRemindersService } from './subscription-reminders.service';
import { TenantSubscriptionsController } from './tenant-subscriptions.controller';
import { TenantSubscriptionsService } from './tenant-subscriptions.service';
import { TrialLifecycleCron } from './trial-lifecycle.cron';

@Module({
  imports: [PlatformSettingsModule],
  controllers: [PlatformSubscriptionsController, TenantSubscriptionsController],
  providers: [
    PlatformSubscriptionsService,
    TenantSubscriptionsService,
    SubscriptionRemindersService,
    FirstScanNudgeCron,
    TrialLifecycleCron,
    ActivationFailureAlertsService,
    ActivationCiphertextSweepService,
  ],
  exports: [PlatformSubscriptionsService, TenantSubscriptionsService, SubscriptionRemindersService],
})
export class PlatformSubscriptionsModule {}
