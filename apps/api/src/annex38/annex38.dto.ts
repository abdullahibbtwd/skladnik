import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ANNEX38_PAYMENT_CODES, ESHOP_NUMBER_MAX, ESHOP_TYPES, ESHOP_URL_MAX, type Annex38PaymentCode, type EShopType } from '@skladnik/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class EShopSettingsDto {
  /** e_shop_n from the NRA registration. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(ESHOP_NUMBER_MAX)
  @Matches(/^[A-Z0-9]+$/, { message: 'The e-shop number has only letters and digits' })
  number!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(ESHOP_URL_MAX)
  webAddress!: string;

  @Type(() => Number)
  @IsIn(ESHOP_TYPES)
  type!: EShopType;

  @Type(() => Number)
  @IsInt()
  @IsIn(ANNEX38_PAYMENT_CODES)
  cashPayment!: Annex38PaymentCode;

  @Type(() => Number)
  @IsInt()
  @IsIn(ANNEX38_PAYMENT_CODES)
  cardPayment!: Annex38PaymentCode;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  posTerminal!: string | null;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentProvider!: string | null;
}

export class Annex38SubmittedDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  submissionRef!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  submittedAt?: string;
}
