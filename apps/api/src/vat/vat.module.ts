import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { VatController } from './vat.controller';
import { VatService } from './vat.service';

@Module({
  imports: [ComplianceModule],
  controllers: [VatController],
  providers: [VatService],
})
export class VatModule {}
