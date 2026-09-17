import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SITE_TYPES, type SiteType } from '@skladnik/shared';

export class CreateSiteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(SITE_TYPES)
  type!: SiteType;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsUUID()
  managerUserId?: string;
}
