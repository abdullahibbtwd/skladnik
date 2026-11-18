import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { APP_LOCALES } from '@skladnik/shared';

export class GoogleAuthDto {
  /** Google Identity Services ID token (`credential` from the GIS callback). */
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  credential!: string;

  @IsOptional()
  @IsIn([...APP_LOCALES])
  locale?: string;
}
