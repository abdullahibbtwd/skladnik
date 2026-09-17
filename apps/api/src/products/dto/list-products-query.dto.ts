import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PRODUCT_STATUSES, type ProductStatus } from '@skladnik/shared';

export class ListProductsQueryDto {
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
