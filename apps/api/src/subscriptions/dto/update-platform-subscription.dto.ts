import { Type } from 'class-transformer';
import {
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

export class UpdatePlatformSubscriptionDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_PLANS)
  plan?: SubscriptionPlan;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxUsers?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  termMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyNameHint?: string | null;

  @IsOptional()
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  externalInvoiceRef?: string | null;
}
