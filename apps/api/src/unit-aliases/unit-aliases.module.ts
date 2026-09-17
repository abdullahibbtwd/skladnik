import { Module } from '@nestjs/common';
import { UnitAliasesController } from './unit-aliases.controller';
import { UnitAliasesService } from './unit-aliases.service';

@Module({
  controllers: [UnitAliasesController],
  providers: [UnitAliasesService],
})
export class UnitAliasesModule {}
