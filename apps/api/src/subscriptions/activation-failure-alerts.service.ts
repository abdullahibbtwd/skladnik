import { Injectable, Logger } from '@nestjs/common';
import { ACTIVATION_FAILED_ALERT_THRESHOLD } from '@skladnik/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tracks failed activation attempts on known code hashes and raises a platform
 * audit alert when the threshold is crossed (without revealing whether a code exists).
 */
@Injectable()
export class ActivationFailureAlertsService {
  private readonly logger = new Logger(ActivationFailureAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordFailedAttempt(input: {
    codeHash: string;
    companyId: string;
    userId: string;
  }) {
    const code = await this.prisma.activationCode.findUnique({
      where: { codeHash: input.codeHash },
      select: {
        id: true,
        failedAttempts: true,
        redeemedAt: true,
        revokedAt: true,
        subscriptionId: true,
        codePrefix: true,
      },
    });
    if (!code || code.redeemedAt || code.revokedAt) return;

    const updated = await this.prisma.activationCode.update({
      where: { id: code.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true, codePrefix: true, subscriptionId: true },
    });

    if (updated.failedAttempts !== ACTIVATION_FAILED_ALERT_THRESHOLD) return;

    this.logger.warn(
      `activation.failed_threshold prefix=${updated.codePrefix} companyId=${input.companyId} attempts=${updated.failedAttempts}`,
    );

    await this.prisma.platformAuditLog.create({
      data: {
        action: 'ACTIVATION_FAILED_THRESHOLD',
        entityType: 'ActivationCode',
        entityId: code.id,
        metadata: {
          codePrefix: updated.codePrefix,
          failedAttempts: updated.failedAttempts,
          companyId: input.companyId,
          userId: input.userId,
          subscriptionId: updated.subscriptionId,
          threshold: ACTIVATION_FAILED_ALERT_THRESHOLD,
        },
      },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: updated.subscriptionId,
        type: 'NOTE',
        actorType: 'SYSTEM',
        payload: {
          kind: 'activation_failed_threshold',
          codePrefix: updated.codePrefix,
          failedAttempts: updated.failedAttempts,
          companyId: input.companyId,
          userId: input.userId,
        },
      },
    });
  }
}
