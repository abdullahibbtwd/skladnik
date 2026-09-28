import { IsOptional, IsUUID } from 'class-validator';

export class StockQueryDto {
  @IsUUID()
  siteId!: string;
}

export class MovementsQueryDto {
  @IsUUID()
  siteId!: string;

  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;
}
