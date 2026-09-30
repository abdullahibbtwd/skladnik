import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { VAT_CREDITS, VAT_LEDGERS, VAT_SALES_GROUPINGS, type VatCredit, type VatLedger, type VatSalesGrouping } from '@skladnik/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_AMOUNT = 999_999_999_999;

/** The VAT number itself is part of the company profile (PUT /company/profile). */
export class VatSettingsDto {
  /** Name as registered for VAT; the company name is used when empty. */
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  legalName!: string | null;

  /** Person submitting the return: ЕГН or name. */
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  declarant!: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  branch!: number;

  @IsIn(VAT_SALES_GROUPINGS)
  salesGrouping!: VatSalesGrouping;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1)
  coefficient!: number;
}

export class VatReturnInputsDto {
  /** Overrides the default coefficient for this period; null uses the default. */
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1)
  coefficient!: number | null;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  cell70!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  cell71!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  cell80!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  cell81!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AMOUNT)
  cell82!: number;
}

export class VatDocumentTreatmentDto {
  /** null = automatic (full credit when VAT is charged, else not in the ledger). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(VAT_CREDITS)
  vatCredit?: VatCredit | null;

  /** null = the month of the document date. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(PERIOD)
  vatPeriod?: string | null;
}

export class VatEntryDto {
  @IsIn(VAT_LEDGERS)
  ledger!: VatLedger;

  @Matches(PERIOD)
  period!: string;

  @Matches(/^\d{2}$/)
  documentType!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  number!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issuedOn!: string;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  partnerTaxId!: string | null;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  partnerName!: string | null;

  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  description!: string | null;

  /** Field number → amount; keys and values are checked in the service. */
  @IsObject()
  amounts!: Record<string, number>;
}

export class VatSubmittedDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  submissionRef!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  submittedAt?: string;
}

export class VatExportQueryDto {
  @IsIn(['purchases', 'sales', 'return'])
  ledger!: 'purchases' | 'sales' | 'return';

  @IsOptional()
  @IsIn(['en', 'bg'])
  lang?: 'en' | 'bg';
}
