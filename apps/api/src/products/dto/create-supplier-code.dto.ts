import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSupplierCodeDto {
  @IsUUID()
  partnerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  supplierCode!: string;
}
