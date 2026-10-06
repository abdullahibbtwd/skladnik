import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@skladnik/shared';

export class ListPlatformSubscriptionsQueryDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUSES)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsIn(SUBSCRIPTION_PLANS)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
