import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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
}
