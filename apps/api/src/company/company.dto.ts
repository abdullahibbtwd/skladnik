import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MAX_EXPIRY_WINDOW_DAYS,
  MAX_PRINT_FOOTER_LENGTH,
  MAX_PRINT_SIGNATURES,
  MAX_SERIES_PADDING,
  MAX_SERIES_PREFIX_LENGTH,
  USER_ROLES,
  type UserRole,
} from '@skladnik/shared';

const emptyToNull = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? null : value);
const present = (_: unknown, value: unknown) => value !== null && value !== undefined;

export class CompanyProfileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(20)
  eik?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(20)
  vatNumber?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(240)
  address?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(120)
  mol?: string | null;

  /** Person signing the VAT return (НАП field 00-04). ACC-06. */
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(50)
  declarant?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf(present)
  @IsEmail()
  @MaxLength(180)
  email?: string | null;
}

export class ExpiryWindowsDto {
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_EXPIRY_WINDOW_DAYS, { each: true })
  windows!: number[];
}

export class PrintTemplateDto {
  @IsBoolean()
  showCompanyDetails!: boolean;

  @IsBoolean()
  showPrices!: boolean;

  @IsBoolean()
  showBatches!: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_PRINT_SIGNATURES)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  signatures!: string[];

  @IsString()
  @MaxLength(MAX_PRINT_FOOTER_LENGTH)
  footer!: string;
}

export class PriceOverrideRolesDto {
  @IsArray()
  @ArrayMaxSize(USER_ROLES.length)
  @IsIn(USER_ROLES, { each: true })
  roles!: UserRole[];
}

export class DocumentSeriesDto {
  @IsString()
  @MaxLength(MAX_SERIES_PREFIX_LENGTH)
  prefix!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SERIES_PADDING)
  padding!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999_999_999)
  nextNumber!: number;

  /** Restart at 1 each calendar year (Europe/Sofia). Default off = continuous sequence. */
  @IsOptional()
  @IsBoolean()
  resetYearly?: boolean;
}
