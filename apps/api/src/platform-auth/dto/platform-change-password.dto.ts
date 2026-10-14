import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class PlatformChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  newPassword!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  totpCode!: string;
}
