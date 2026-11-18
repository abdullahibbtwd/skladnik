import { APP_LOCALES } from '@skladnik/shared';
import { isEmailOrPhoneContact } from '@skladnik/shared';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'emailOrPhone', async: false })
export class EmailOrPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isEmailOrPhoneContact(value);
  }

  defaultMessage() {
    return 'Contact must be a valid email or phone number';
  }
}

export class CreateQuoteRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  businessType!: string;

  @IsInt()
  @Min(1)
  @Max(9999)
  locations!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @Validate(EmailOrPhoneConstraint)
  contact!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsIn([...APP_LOCALES])
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;

  /** Honeypot — bots fill this; humans leave it empty. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
