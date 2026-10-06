import { IsString, MaxLength, MinLength } from 'class-validator';

export class ActivateSubscriptionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  code!: string;
}
