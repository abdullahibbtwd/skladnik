import { ArrayUnique, IsArray, IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';
import { USER_ROLES, type UserRole } from '@skladnik/shared';

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsIn(USER_ROLES)
  role!: UserRole;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  siteIds?: string[];
}
