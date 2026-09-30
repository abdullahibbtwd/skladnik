import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { Annex38Controller } from './annex38.controller';
import { Annex38Service } from './annex38.service';

@Module({
  imports: [ComplianceModule],
  controllers: [Annex38Controller],
  providers: [Annex38Service],
})
export class Annex38Module {}
