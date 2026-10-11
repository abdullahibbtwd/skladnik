import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ActivateSubscriptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  /** Required when preview reported eik_matches_company=false and mode is WARN. */
  @IsOptional()
  @IsBoolean()
  confirmEikMismatch?: boolean;
}

export class PreviewActivationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;
}
