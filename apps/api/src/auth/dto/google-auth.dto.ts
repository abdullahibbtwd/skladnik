import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleAuthDto {
  /** Google Identity Services ID token (`credential` from the GIS callback). */
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  credential!: string;
}
