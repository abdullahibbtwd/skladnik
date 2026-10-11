import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ACTIVATION_EIK_MISMATCH_MODES } from '@skladnik/shared';

export class UpdatePlatformBillingSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sellerName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  sellerEik!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  sellerAddress!: string;

  @IsEmail()
  @MaxLength(200)
  sellerEmail!: string;

  @IsOptional()
  @IsIn([...ACTIVATION_EIK_MISMATCH_MODES])
  activationEikMismatchMode?: (typeof ACTIVATION_EIK_MISMATCH_MODES)[number];
}
