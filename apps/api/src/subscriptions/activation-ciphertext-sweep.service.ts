import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PlatformSubscriptionsService } from './platform-subscriptions.service';

/** Daily wipe of stale ActivationCode.codeCiphertext (expired / non-PENDING / redeemed / revoked). */
@Injectable()
export class ActivationCiphertextSweepService {
  private readonly logger = new Logger(ActivationCiphertextSweepService.name);

  constructor(private readonly subscriptions: PlatformSubscriptionsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep() {
    const cleared = await this.subscriptions.sweepStaleCiphertexts();
    if (cleared > 0) {
      this.logger.log(`Ciphertext sweep cleared ${cleared} row(s)`);
    }
  }
}
