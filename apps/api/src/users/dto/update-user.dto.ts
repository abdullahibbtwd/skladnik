import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { USER_ROLES, type UserRole } from '@skladnik/shared';

export class UpdateUserDto {
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  siteIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
