import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@skladnik/shared';

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

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMinor!: number;

  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
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
