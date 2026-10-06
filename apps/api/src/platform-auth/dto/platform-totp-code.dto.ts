import { IsString, Matches } from 'class-validator';

export class PlatformTotpCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'TOTP code must be 6 digits' })
  code!: string;
}
