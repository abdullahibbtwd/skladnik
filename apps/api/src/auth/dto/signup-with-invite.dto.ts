import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupWithInviteDto {
  @IsString()
  @MinLength(16)
  token!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
