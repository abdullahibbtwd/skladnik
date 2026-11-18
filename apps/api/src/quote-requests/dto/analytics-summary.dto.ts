import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export class AnalyticsSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([30, 90])
  days?: 30 | 90;
}
