import { Type } from 'class-transformer';
import {
  Allow,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@skladnik/shared';

/**
 * Transport DTO. Business rules (EIK checksum, price ≥ 0, VAT 0–100, …) are
 * enforced by validateCreatePlatformSubscription() so every field error is
 * returned together — class-validator alone would still allow invalid EIKs.
 *
 * priceMinor / vatRate use @Allow() (not @IsNumber) so whitelist keeps them
 * while negative/NaN values still reach the shared validator.
 */
export class CreatePlatformSubscriptionDto {
  @IsIn(SUBSCRIPTION_PLANS)
  plan!: SubscriptionPlan;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxUsers!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  termMonths!: number;

  /** May be negative or NaN at the pipe boundary — shared validator rejects. */
  @Allow()
  @Type(() => Number)
  priceMinor!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  /** Non-numeric strings become NaN — shared validator rejects. */
  @Allow()
  @Type(() => Number)
  vatRate!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  buyerName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  buyerEik!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  buyerAddress!: string;

  @IsEmail()
  buyerEmail!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  invoiceTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyNameHint?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  externalInvoiceRef?: string;
}
