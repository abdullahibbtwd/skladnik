import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlatformAuthUser } from '../platform-auth/platform-auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePlatformBillingSettingsDto } from './dto/update-platform-billing-settings.dto';

const SETTINGS_ID = 'default';

export type PlatformBillingSettingsView = {
  sellerName: string;
  sellerEik: string;
  sellerAddress: string;
  sellerEmail: string;
  configured: boolean;
  updatedAt: string;
};

export type InvoiceSellerSnapshot = {
  sellerName: string;
  sellerEik: string;
  sellerAddress: string;
  sellerEmail: string;
};

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getBilling(): Promise<PlatformBillingSettingsView> {
    const row = await this.ensureRow();
    return this.serialize(row);
  }

  /** Seller snapshot for issuing invoices; throws if Settings are incomplete. */
  async requireSeller(): Promise<InvoiceSellerSnapshot> {
    const view = await this.getBilling();
    if (!view.configured) {
      throw new ServiceUnavailableException(
        'Invoice seller identity is not configured. Set it in platform Settings.',
      );
    }
    return {
      sellerName: view.sellerName,
      sellerEik: view.sellerEik,
      sellerAddress: view.sellerAddress,
      sellerEmail: view.sellerEmail,
    };
  }

  async updateBilling(
    admin: PlatformAuthUser,
    dto: UpdatePlatformBillingSettingsDto,
  ): Promise<PlatformBillingSettingsView> {
    await this.ensureRow();
    const row = await this.prisma.platformBillingSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        sellerName: dto.sellerName.trim(),
        sellerEik: dto.sellerEik.trim(),
        sellerAddress: dto.sellerAddress.trim(),
        sellerEmail: dto.sellerEmail.trim().toLowerCase(),
        updatedByAdminId: admin.id,
      },
    });

    await this.prisma.platformAuditLog.create({
      data: {
        adminId: admin.id,
        action: 'BILLING_SETTINGS_UPDATE',
        entityType: 'PlatformBillingSettings',
        entityId: SETTINGS_ID,
        after: {
          sellerName: row.sellerName,
          sellerEik: row.sellerEik,
          sellerAddress: row.sellerAddress,
          sellerEmail: row.sellerEmail,
        },
      },
    });

    return this.serialize(row);
  }

  private async ensureRow() {
    const existing = await this.prisma.platformBillingSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (existing) {
      if (!this.isComplete(existing)) {
        const fromEnv = this.readLegacyEnvSeller();
        if (fromEnv) {
          return this.prisma.platformBillingSettings.update({
            where: { id: SETTINGS_ID },
            data: fromEnv,
          });
        }
      }
      return existing;
    }

    const fromEnv = this.readLegacyEnvSeller();
    return this.prisma.platformBillingSettings.create({
      data: {
        id: SETTINGS_ID,
        sellerName: fromEnv?.sellerName ?? '',
        sellerEik: fromEnv?.sellerEik ?? '',
        sellerAddress: fromEnv?.sellerAddress ?? '',
        sellerEmail: fromEnv?.sellerEmail ?? '',
      },
    });
  }

  /** One-time bridge while INVOICE_SELLER_* is removed from env. */
  private readLegacyEnvSeller(): InvoiceSellerSnapshot | null {
    const sellerName = this.config.get<string>('INVOICE_SELLER_NAME')?.trim();
    const sellerEik = this.config.get<string>('INVOICE_SELLER_EIK')?.trim();
    const sellerAddress = this.config.get<string>('INVOICE_SELLER_ADDRESS')?.trim();
    const sellerEmail = this.config.get<string>('INVOICE_SELLER_EMAIL')?.trim();
    if (!sellerName || !sellerEik || !sellerAddress || !sellerEmail) return null;
    return { sellerName, sellerEik, sellerAddress, sellerEmail };
  }

  private isComplete(row: {
    sellerName: string;
    sellerEik: string;
    sellerAddress: string;
    sellerEmail: string;
  }) {
    return Boolean(
      row.sellerName.trim() &&
        row.sellerEik.trim() &&
        row.sellerAddress.trim() &&
        row.sellerEmail.trim(),
    );
  }

  private serialize(row: {
    sellerName: string;
    sellerEik: string;
    sellerAddress: string;
    sellerEmail: string;
    updatedAt: Date;
  }): PlatformBillingSettingsView {
    const sellerName = row.sellerName.trim();
    const sellerEik = row.sellerEik.trim();
    const sellerAddress = row.sellerAddress.trim();
    const sellerEmail = row.sellerEmail.trim();
    return {
      sellerName,
      sellerEik,
      sellerAddress,
      sellerEmail,
      configured: Boolean(sellerName && sellerEik && sellerAddress && sellerEmail),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
