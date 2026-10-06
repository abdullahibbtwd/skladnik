import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@skladnik/shared';

export class TransitionSubscriptionDto {
  @IsIn(SUBSCRIPTION_STATUSES)
  toStatus!: SubscriptionStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
