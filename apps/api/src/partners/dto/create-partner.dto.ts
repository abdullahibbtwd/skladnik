import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PARTNER_KINDS, type PartnerKind } from '@skladnik/shared';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreatePartnerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  name!: string;

  @IsIn(PARTNER_KINDS)
  kind!: PartnerKind;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(32)
  taxId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(120)
  mol?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @ValidateIf((_, value) => value !== undefined)
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(64)
  bankAccount?: string;
}
